use std::io;
use std::path::Path;
use std::sync::Mutex;

use async_compression::tokio::bufread::ZstdDecoder;
use ndarray::Array2;
use ort::session::Session;
use ort::session::builder::GraphOptimizationLevel;
use ort::value::Tensor;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::io::AsyncReadExt;
use utoipa::ToSchema;

pub(crate) const N_FEATURES: usize = 23;

/// Convert a raw badge value (11–116) to a 1-based contiguous index (1–66).
///
/// Formula: `(badge / 10 - 1) * 6 + badge % 10`
/// e.g. badge 82 → (8-1)*6 + 2 = 44
pub(crate) fn badge_to_idx(badge: i32) -> i32 {
    (badge / 10 - 1) * 6 + badge % 10
}

/// Convert a model output index (1..=66) to a badge ID.
///
/// The Python model outputs 1-based indices. Tiers 1–11, 6 sub-ranks each.
/// Index 1 → badge 11, index 66 → badge 116. Out-of-range values are clamped.
pub(crate) fn idx_to_badge(idx: i32) -> i32 {
    let idx = idx.clamp(1, 66);
    10 * ((idx - 1) / 6) + 11 + (idx - 1) % 6
}

#[derive(Debug, Error)]
pub(crate) enum RankPredictorError {
    #[error("IO error: {0}")]
    Io(#[from] io::Error),
    #[error("ONNX runtime error: {0}")]
    Ort(#[from] ort::Error),
    #[error("ONNX builder error: {0}")]
    OrtLoad(String),
    #[error("Calibration JSON error: {0}")]
    Calibration(String),
    #[error("Session mutex was poisoned")]
    MutexPoisoned,
    #[error("Model output tensor is empty")]
    EmptyOutput,
    #[error("Model file not found: {0}")]
    ModelNotFound(&'static str),
    #[error("Calibration knots malformed (len_x={x}, len_y={y}); both must be equal and non-empty")]
    BadKnots { x: usize, y: usize },
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct RankPrediction {
    /// See more: <https://assets.deadlock-api.com/v2/ranks>
    pub(crate) badge: i32,
    /// Calibrated model output (float index into badge space)
    pub(crate) raw_score: f32,
}

#[derive(Debug, Clone, Deserialize)]
struct CalibrationFile {
    blend_lgbm_weight: f32,
    calibration_threshold: f32,
    isotonic_knots_x: Vec<f32>,
    isotonic_knots_y: Vec<f32>,
}

#[derive(Debug, Clone)]
struct Calibration {
    threshold: f32,
    blend_lgbm_weight: f32,
    knots_x: Vec<f32>,
    knots_y: Vec<f32>,
}

pub(crate) struct RankPredictor {
    xgb: Mutex<Session>,
    lgbm: Mutex<Session>,
    calib: Calibration,
}

impl RankPredictor {
    /// Load the ONNX models and calibration artifact.
    pub(crate) async fn load() -> Result<Self, RankPredictorError> {
        let xgb_bytes = Self::read_onnx_bytes("xgb").await?;
        let lgbm_bytes = Self::read_onnx_bytes("lgbm").await?;
        let calib = Self::read_calibration().await?;

        let xgb = build_session(&xgb_bytes)?;
        let lgbm = build_session(&lgbm_bytes)?;

        Ok(Self {
            xgb: Mutex::new(xgb),
            lgbm: Mutex::new(lgbm),
            calib,
        })
    }

    /// Try `model/<name>.onnx`, then `model/<name>.onnx.zst`, then `<name>.onnx.zst`.
    async fn read_onnx_bytes(name: &'static str) -> Result<Vec<u8>, RankPredictorError> {
        let plain = format!("model/{name}.onnx");
        if let Ok(bytes) = tokio::fs::read(&plain).await {
            return Ok(bytes);
        }
        let zst_paths = [format!("model/{name}.onnx.zst"), format!("{name}.onnx.zst")];
        for p in &zst_paths {
            if let Ok(zst) = tokio::fs::read(p).await {
                let mut decoder = ZstdDecoder::new(zst.as_slice());
                let mut out = Vec::new();
                decoder.read_to_end(&mut out).await?;
                return Ok(out);
            }
        }
        Err(RankPredictorError::ModelNotFound(name))
    }

    async fn read_calibration() -> Result<Calibration, RankPredictorError> {
        let candidates = [
            "model/calibration.json",
            "model/calibration.json.zst",
            "calibration.json",
            "calibration.json.zst",
        ];
        let mut json_bytes: Option<Vec<u8>> = None;
        for p in &candidates {
            if let Ok(bytes) = tokio::fs::read(p).await {
                if Path::new(p).extension().is_some_and(|e| e == "zst") {
                    let mut decoder = ZstdDecoder::new(bytes.as_slice());
                    let mut out = Vec::new();
                    decoder.read_to_end(&mut out).await?;
                    json_bytes = Some(out);
                } else {
                    json_bytes = Some(bytes);
                }
                break;
            }
        }
        let bytes = json_bytes.ok_or(RankPredictorError::ModelNotFound("calibration.json"))?;
        let parsed: CalibrationFile = serde_json::from_slice(&bytes)
            .map_err(|e| RankPredictorError::Calibration(e.to_string()))?;
        if parsed.isotonic_knots_x.len() != parsed.isotonic_knots_y.len()
            || parsed.isotonic_knots_x.is_empty()
        {
            return Err(RankPredictorError::BadKnots {
                x: parsed.isotonic_knots_x.len(),
                y: parsed.isotonic_knots_y.len(),
            });
        }
        Ok(Calibration {
            threshold: parsed.calibration_threshold,
            blend_lgbm_weight: parsed.blend_lgbm_weight,
            knots_x: parsed.isotonic_knots_x,
            knots_y: parsed.isotonic_knots_y,
        })
    }

    /// Run inference on a 23-element feature vector.
    pub(crate) fn predict(
        &self,
        features: [f64; N_FEATURES],
    ) -> Result<RankPrediction, RankPredictorError> {
        let xgb_score = run_session(&self.xgb, &features)?;
        let lgbm_score = run_session(&self.lgbm, &features)?;

        let blend = self.calib.blend_lgbm_weight;
        let blended = (1.0 - blend) * xgb_score + blend * lgbm_score;

        let raw_score = if blended >= self.calib.threshold {
            interp_isotonic(blended, &self.calib.knots_x, &self.calib.knots_y)
        } else {
            blended
        };

        #[allow(clippy::cast_possible_truncation)]
        let badge = idx_to_badge(raw_score.round() as i32);
        Ok(RankPrediction { badge, raw_score })
    }
}

fn build_session(bytes: &[u8]) -> Result<Session, RankPredictorError> {
    Session::builder()
        .map_err(|e| RankPredictorError::OrtLoad(e.to_string()))?
        .with_optimization_level(GraphOptimizationLevel::Disable)
        .map_err(|e| RankPredictorError::OrtLoad(e.to_string()))?
        .commit_from_memory(bytes)
        .map_err(RankPredictorError::Ort)
}

fn run_session(
    session: &Mutex<Session>,
    features: &[f64; N_FEATURES],
) -> Result<f32, RankPredictorError> {
    let input = Array2::from_shape_fn((1, N_FEATURES), |(_, j)| features[j]);
    let tensor = Tensor::from_array(input)?;
    let mut guard = session
        .lock()
        .map_err(|_| RankPredictorError::MutexPoisoned)?;
    let outputs = guard.run(ort::inputs!["X" => tensor])?;
    let (_shape, data) = outputs[0].try_extract_tensor::<f32>()?;
    Ok(*data.first().ok_or(RankPredictorError::EmptyOutput)?)
}

/// Piecewise-linear interpolation that clamps at the ends — matches
/// scikit-learn `IsotonicRegression(out_of_bounds="clip")`.
fn interp_isotonic(x: f32, xs: &[f32], ys: &[f32]) -> f32 {
    if x <= xs[0] {
        return ys[0];
    }
    if x >= xs[xs.len() - 1] {
        return ys[ys.len() - 1];
    }
    let i = xs.partition_point(|&v| v <= x).saturating_sub(1);
    let dx = xs[i + 1] - xs[i];
    if dx == 0.0 {
        return ys[i];
    }
    let t = (x - xs[i]) / dx;
    ys[i] + t * (ys[i + 1] - ys[i])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_idx_to_badge_boundaries() {
        assert_eq!(idx_to_badge(1), 11);
        assert_eq!(idx_to_badge(6), 16);
        assert_eq!(idx_to_badge(7), 21);
        assert_eq!(idx_to_badge(66), 116);
        // out-of-range values are clamped
        assert_eq!(idx_to_badge(0), 11);
        assert_eq!(idx_to_badge(67), 116);
    }

    #[test]
    fn test_idx_to_badge_known_values() {
        // Python: 10 * ((44-1)//6) + 11 + ((44-1)%6) = 10*7 + 11 + 1 = 82
        assert_eq!(idx_to_badge(44), 82);
        // Ascendant 3: 10 * ((57-1)//6) + 11 + ((57-1)%6) = 10*9 + 11 + 2 = 103
        assert_eq!(idx_to_badge(57), 103);
    }

    #[test]
    fn test_badge_to_idx() {
        assert_eq!(badge_to_idx(11), 1);
        assert_eq!(badge_to_idx(16), 6);
        assert_eq!(badge_to_idx(21), 7);
        assert_eq!(badge_to_idx(82), 44);
        assert_eq!(badge_to_idx(116), 66);
    }

    #[test]
    fn test_roundtrip() {
        for idx in 1..=66 {
            let badge = idx_to_badge(idx);
            assert_eq!(badge_to_idx(badge), idx);
        }
    }

    #[test]
    fn test_interp_isotonic_clamps_and_interpolates() {
        let xs = [0.0_f32, 1.0, 2.0, 3.0];
        let ys = [10.0_f32, 12.0, 12.0, 20.0];
        // clamp low / high
        assert!((interp_isotonic(-5.0, &xs, &ys) - 10.0).abs() < 1e-6);
        assert!((interp_isotonic(99.0, &xs, &ys) - 20.0).abs() < 1e-6);
        // exact knot
        assert!((interp_isotonic(1.0, &xs, &ys) - 12.0).abs() < 1e-6);
        // halfway in linear segment
        assert!((interp_isotonic(2.5, &xs, &ys) - 16.0).abs() < 1e-6);
    }

    /// Feature vector shaped like a mid-tier (Archon, idx ~44, badge 82) player.
    /// Indices 0..=16 match the original model; 17..=22 are the new
    /// `shot_accuracy` / `win_rate` / `net_worth_pm` / `kda` / `denies_pm` /
    /// `nw_ratio` weighted means added in the two-model rewrite.
    fn sample_features() -> [f64; N_FEATURES] {
        [
            44.0, 44.0, 44.0, 44.0, 44.0, 44.0, 1.5, 50_000.0, 30_000.0, 44.0, 46.0, 0.3, 5.0, 0.3,
            0.3, 0.55, 24.0, // new features below
            0.4, 0.5, 1_000.0, 2.5, 2.0, 1.0,
        ]
    }

    #[tokio::test]
    #[ignore = "slow: loads the full ONNX model"]
    async fn test_model_loads_and_predicts_valid_badge() {
        let predictor = RankPredictor::load()
            .await
            .expect("rank prediction model should load from model/*.onnx.zst");

        let prediction = predictor
            .predict(sample_features())
            .expect("inference should succeed on a well-formed feature vector");

        assert!(
            (11..=116).contains(&prediction.badge),
            "badge {} outside valid rank range",
            prediction.badge
        );
        let tier = prediction.badge / 10;
        let sub_rank = prediction.badge % 10;
        assert!((1..=11).contains(&tier), "invalid tier {tier}");
        assert!((1..=6).contains(&sub_rank), "invalid sub-rank {sub_rank}");

        assert!(
            prediction.raw_score.is_finite(),
            "raw_score must be finite, got {}",
            prediction.raw_score
        );
        assert!(
            (0.0..=70.0).contains(&prediction.raw_score),
            "raw_score {} outside plausible index range",
            prediction.raw_score
        );
    }

    #[tokio::test]
    #[ignore = "slow: loads the full ONNX model"]
    async fn test_model_is_deterministic() {
        let predictor = RankPredictor::load()
            .await
            .expect("rank prediction model should load");

        let features = sample_features();
        let first = predictor.predict(features).expect("first inference");
        let second = predictor.predict(features).expect("second inference");

        assert_eq!(first.badge, second.badge);
        assert!(
            (first.raw_score - second.raw_score).abs() < f32::EPSILON,
            "raw_score drifted between identical inferences: {} vs {}",
            first.raw_score,
            second.raw_score
        );
    }

    #[tokio::test]
    #[ignore = "slow: loads the full ONNX model"]
    async fn test_model_is_monotonic_in_own_badge() {
        let predictor = RankPredictor::load()
            .await
            .expect("rank prediction model should load");

        let mut low = sample_features();
        let mut high = sample_features();
        for i in [0usize, 2, 4] {
            low[i] = 20.0;
            high[i] = 60.0;
        }
        low[9] = 20.0;
        low[10] = 22.0;
        high[9] = 60.0;
        high[10] = 62.0;

        let low_pred = predictor.predict(low).expect("low-badge inference");
        let high_pred = predictor.predict(high).expect("high-badge inference");

        assert!(
            high_pred.raw_score >= low_pred.raw_score,
            "expected higher own-badge features to predict >= raw_score, got low={} high={}",
            low_pred.raw_score,
            high_pred.raw_score
        );
    }
}
