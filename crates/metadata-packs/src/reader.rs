use core::time::Duration;
use std::sync::Arc;

use bytes::Bytes;
use metrics::counter;
use object_store::{ObjectStore, ObjectStoreExt as _};

use crate::format::pack_key;
use crate::{Index, Kind};

/// The longest an index lookup may take before the caller falls back to the loose objects (which
/// are gone for packed files, so this errs long).
const LOOKUP_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Debug, thiserror::Error)]
pub enum ReadError {
    #[error(transparent)]
    Index(#[from] sqlx::Error),
    #[error("index lookup timed out")]
    IndexTimeout,
    #[error(transparent)]
    Store(#[from] object_store::Error),
    #[error("pack bucket {0} is not configured")]
    UnknownBucket(u16),
    #[error("index entry overflows")]
    BadLocation,
    #[error("pack {pack_id} returned {actual} bytes, the index says {expected}")]
    Length {
        pack_id: u64,
        expected: u32,
        actual: usize,
    },
    #[error("crc mismatch in pack {pack_id} at offset {offset}")]
    Crc { pack_id: u64, offset: u64 },
}

impl ReadError {
    const fn label(&self) -> &'static str {
        match self {
            Self::Index(_) => "index_error",
            Self::IndexTimeout => "index_timeout",
            Self::Store(_) => "store_error",
            Self::UnknownBucket(_) | Self::BadLocation => "bad_location",
            Self::Length { .. } => "length_mismatch",
            Self::Crc { .. } => "crc_mismatch",
        }
    }
}

/// Serves single files out of packs: one index lookup, then one range GET.
#[derive(Debug, Clone)]
pub struct PackReader {
    index: Index,
    /// Pack buckets by their ordinal in the index.
    buckets: Vec<Arc<dyn ObjectStore>>,
    prefix: Arc<str>,
}

impl PackReader {
    #[must_use]
    pub fn new(index: Index, buckets: Vec<Arc<dyn ObjectStore>>, prefix: &str) -> Self {
        Self {
            index,
            buckets,
            prefix: Arc::from(prefix),
        }
    }

    #[must_use]
    pub const fn index(&self) -> &Index {
        &self.index
    }

    /// The file of the first kind in `kinds` that is packed for `match_id`, checked against its
    /// crc. `None` when none is packed.
    pub async fn get(
        &self,
        match_id: u64,
        kinds: &[Kind],
    ) -> Result<Option<(Bytes, Kind)>, ReadError> {
        let result = self.fetch(match_id, kinds).await;
        let label = match &result {
            Ok(Some(_)) => "hit",
            Ok(None) => "miss",
            Err(e) => e.label(),
        };
        counter!("metadata_packs.read", "result" => label).increment(1);
        result
    }

    async fn fetch(
        &self,
        match_id: u64,
        kinds: &[Kind],
    ) -> Result<Option<(Bytes, Kind)>, ReadError> {
        let location = tokio::time::timeout(LOOKUP_TIMEOUT, self.index.lookup(match_id, kinds))
            .await
            .ok()
            .ok_or(ReadError::IndexTimeout)??;
        let Some(loc) = location else {
            return Ok(None);
        };
        let store = self
            .buckets
            .get(usize::from(loc.bucket))
            .ok_or(ReadError::UnknownBucket(loc.bucket))?;
        let end = loc
            .offset
            .checked_add(u64::from(loc.length))
            .ok_or(ReadError::BadLocation)?;
        let bytes = store
            .get_range(&pack_key(&self.prefix, loc.pack_id), loc.offset..end)
            .await?;
        if u32::try_from(bytes.len()).ok() != Some(loc.length) {
            return Err(ReadError::Length {
                pack_id: loc.pack_id,
                expected: loc.length,
                actual: bytes.len(),
            });
        }
        if crc32fast::hash(&bytes) != loc.crc32 {
            return Err(ReadError::Crc {
                pack_id: loc.pack_id,
                offset: loc.offset,
            });
        }
        Ok(Some((bytes, loc.kind)))
    }
}
