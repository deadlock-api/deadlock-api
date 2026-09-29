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
    #[error("steam.inf parse error: {0}")]
    SteamInfo(String),
    #[error("map parse error: {0}")]
    Map(String),
}

impl AssetsError {
    /// Whether a source file doesn't exist for the requested version (e.g.
    /// `scripts/loot_tables.vdata`, which is gone from build 6711 on).
    pub(crate) fn is_not_found(&self) -> bool {
        matches!(
            self,
            Self::Store(store::VersionStoreError::ObjectStore(
                object_store::Error::NotFound { .. }
            ))
        )
    }
}
