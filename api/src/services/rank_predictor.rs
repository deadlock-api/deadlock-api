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

/// Convert a model output index (0..=65) to a badge ID.
///
/// Tiers 1–11, 6 sub-ranks each (same mapping as the MMR module).
/// Index 0 → badge 11, index 65 → badge 116. Out-of-range values are clamped.
pub(crate) fn idx_to_badge(idx: i32) -> i32 {
    let idx = idx.clamp(0, 65);
    (idx / 6 + 1) * 10 + idx % 6 + 1
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
        features: [f64; 13],
    ) -> Result<RankPrediction, RankPredictorError> {
        let input = Array2::from_shape_fn((1, 13), |(_, j)| features[j]);
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

    fn badge_to_idx(badge: i32) -> Option<i32> {
        let tier = badge / 10;
        let sub = badge % 10;
        if !(1..=11).contains(&tier) || !(1..=6).contains(&sub) {
            return None;
        }
        Some((tier - 1) * 6 + (sub - 1))
    }

    #[test]
    fn test_idx_to_badge_boundaries() {
        assert_eq!(idx_to_badge(0), 11);
        assert_eq!(idx_to_badge(5), 16);
        assert_eq!(idx_to_badge(6), 21);
        assert_eq!(idx_to_badge(65), 116);
        // out-of-range values are clamped
        assert_eq!(idx_to_badge(-1), 11);
        assert_eq!(idx_to_badge(66), 116);
    }

    #[test]
    fn test_idx_to_badge_oracle_2() {
        assert_eq!(idx_to_badge(43), 82);
    }

    #[test]
    fn test_roundtrip() {
        for idx in 0..=65 {
            let badge = idx_to_badge(idx);
            assert_eq!(badge_to_idx(badge), Some(idx));
        }
    }
}
