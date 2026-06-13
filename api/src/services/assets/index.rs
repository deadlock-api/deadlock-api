use bytes::Bytes;
use cached::macros::cached;
use object_store::aws::AmazonS3;
use strum::IntoStaticStr;

use crate::services::assets::versions::store::{VersionStoreError, fetch_zst};

/// Asset folders that have a published `index.json.zst` file-tree.
#[derive(Debug, Clone, Copy, IntoStaticStr)]
#[strum(serialize_all = "lowercase")]
pub(crate) enum IndexFolder {
    Images,
    Icons,
    Sounds,
    Fonts,
}

/// Fetch the cached JSON file-tree index for `folder`.
#[cached(
    ttl = 3600,
    convert = r#"{ <&str>::from(folder) }"#,
    key = "&'static str",
    sync_writes = "by_key"
)]
pub(crate) async fn fetch_index(
    r2: &AmazonS3,
    folder: IndexFolder,
) -> Result<Bytes, VersionStoreError> {
    let folder = <&str>::from(folder);
    fetch_zst(r2, &format!("assets-api-res/{folder}/index.json.zst")).await
}
