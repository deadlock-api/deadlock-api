//! Shared cached loader for the per-version localization JSON.

use core::time::Duration;
use std::collections::HashMap;
use std::sync::Arc;

use cached::LruTtlCache;
use cached::macros::cached;
use object_store::aws::AmazonS3;

use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::store;

const CACHE_SIZE: usize = 64;
const CACHE_TTL: Duration = Duration::from_hours(24);

/// Falls back to english when the requested language is missing.
#[cached(
    ty = "LruTtlCache<(u32, String), Arc<HashMap<String, String>>>",
    create = "{ LruTtlCache::builder().size(CACHE_SIZE).ttl(CACHE_TTL).build() }",
    convert = r#"{ (version, language.to_owned()) }"#,
    result = true,
    sync_writes = "by_key"
)]
pub(crate) async fn fetch_localization(
    r2: &AmazonS3,
    version: u32,
    language: &str,
) -> Result<Arc<HashMap<String, String>>, AssetsError> {
    match store::fetch_text(r2, version, &format!("localization/{language}.json")).await {
        Ok(json) => Ok(Arc::new(serde_json::from_str(&json)?)),
        Err(store::VersionStoreError::ObjectStore(object_store::Error::NotFound { .. }))
            if language != "english" =>
        {
            tracing::warn!(
                "localization/{language}.json missing for v{version}; falling back to english"
            );
            let json = store::fetch_text(r2, version, "localization/english.json").await?;
            Ok(Arc::new(serde_json::from_str(&json)?))
        }
        Err(e) => Err(e.into()),
    }
}
