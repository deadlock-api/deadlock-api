use std::io;
use std::sync::Mutex;

use async_compression::tokio::bufread::ZstdDecoder;
use ndarray::Array2;
use ort::session::Session;
use ort::session::builder::GraphOptimizationLevel;
use ort::value::Tensor;
use serde::Serialize;
use thiserror::Error;
use tokio::io::AsyncReadExt;
use utoipa::ToSchema;

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
    #[error("Session mutex was poisoned")]
    MutexPoisoned,
    #[error("Model output tensor is empty")]
    EmptyOutput,
    #[error("Model file not found (tried model/xgb.onnx, model/xgb.onnx.zst, xgb.onnx.zst)")]
    ModelNotFound,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct RankPrediction {
    /// See more: <https://assets.deadlock-api.com/v2/ranks>
    pub(crate) badge: i32,
    /// Raw model output (float index into badge space)
    pub(crate) raw_score: f32,
}

pub(crate) struct RankPredictor {
    session: Mutex<Session>,
}

impl RankPredictor {
    /// Load the ONNX model.
    pub(crate) async fn load() -> Result<Self, RankPredictorError> {
        let model_bytes = Self::read_model_bytes().await?;
        let session = Session::builder()
            .map_err(|e| RankPredictorError::OrtLoad(e.to_string()))?
            .with_optimization_level(GraphOptimizationLevel::Disable)
            .map_err(|e| RankPredictorError::OrtLoad(e.to_string()))?
            .commit_from_memory(&model_bytes)?;
        Ok(Self {
            session: Mutex::new(session),
        })
    }

    async fn read_model_bytes() -> Result<Vec<u8>, RankPredictorError> {
        if let Ok(bytes) = tokio::fs::read("model/xgb.onnx").await {
            return Ok(bytes);
        }
        let zst = match tokio::fs::read("model/xgb.onnx.zst").await {
            Ok(b) => Ok(b),
            Err(_) => tokio::fs::read("xgb.onnx.zst").await,
        };
        if let Ok(zst) = zst {
            let mut decoder = ZstdDecoder::new(zst.as_slice());
            let mut out = Vec::new();
            decoder.read_to_end(&mut out).await?;
            return Ok(out);
        }
        Err(RankPredictorError::ModelNotFound)
    }

    /// Run inference on a 13-element feature vector.
    pub(crate) fn predict(
        &self,
        features: [f64; 16],
    ) -> Result<RankPrediction, RankPredictorError> {
        let input = Array2::from_shape_fn((1, 16), |(_, j)| features[j]);
        let tensor = Tensor::from_array(input)?;
        let mut guard = self
            .session
            .lock()
            .map_err(|_| RankPredictorError::MutexPoisoned)?;
        let outputs = guard.run(ort::inputs!["X" => tensor])?;
        let (_shape, data) = outputs[0].try_extract_tensor::<f32>()?;
        let raw_score = *data.first().ok_or(RankPredictorError::EmptyOutput)?;
        #[allow(clippy::cast_possible_truncation)]
        let badge = idx_to_badge(raw_score.round() as i32);
        Ok(RankPrediction { badge, raw_score })
    }
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
}
