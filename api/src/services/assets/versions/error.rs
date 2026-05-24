use crate::services::assets::versions::store;
use crate::utils::kv3;

#[derive(Debug, thiserror::Error)]
pub(crate) enum AssetsError {
    #[error("KV3 parse error: {0}")]
    Kv3(#[from] kv3::Kv3Error),
    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Asset fetch error: {0}")]
    Store(#[from] store::VersionStoreError),
}
