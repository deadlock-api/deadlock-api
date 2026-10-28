use std::collections::HashMap;
use std::sync::Arc;

use object_store::aws::AmazonS3;
use thiserror::Error;
use tracing::{debug, warn};

use crate::types::{AssetsHero, AssetsRanks};
use crate::versions::error::AssetsError;
use crate::versions::heroes::{Hero, fetch_heroes as build_heroes};
use crate::versions::items::{Item, fetch_items as build_items};
use crate::versions::ranks::{Rank, RankImages, fetch_ranks as build_ranks};
use crate::versions::store::{VersionStore, VersionStoreError};

/// Language the internal lookups resolve hero/rank names in. The streamkit
/// commands and analytics validators only need English display names.
const DEFAULT_LANGUAGE: &str = "english";

/// Why an [`AssetsClient`] lookup failed.
#[derive(Debug, Error)]
pub enum AssetsClientError {
    #[error("building {what}: {source}")]
    Build {
        what: &'static str,
        source: AssetsError,
    },
    #[error("version listing: {0}")]
    VersionListing(#[from] VersionStoreError),
    #[error("no asset versions available")]
    NoVersions,
    #[error("serializing rank images: {0}")]
    RankImages(#[from] serde_json::Error),
}

pub type AssetsClientResult<T> = Result<T, AssetsClientError>;

/// Loads hero/rank metadata directly from the versioned R2 assets.
///
/// Builds the data in-process from the latest published game version. The
/// underlying `build_*` functions are cached per `(version, language)`, so
/// repeated calls don't re-parse the source files.
#[derive(Clone)]
pub struct AssetsClient {
    r2_client: AmazonS3,
    version_store: VersionStore,
}

impl AssetsClient {
    #[must_use]
    pub const fn new(r2_client: AmazonS3, version_store: VersionStore) -> Self {
        Self {
            r2_client,
            version_store,
        }
    }

    /// Heroes for the latest known client version.
    pub async fn fetch_heroes(&self) -> AssetsClientResult<Vec<AssetsHero>> {
        debug!("Loading heroes from versioned assets");
        Ok(self
            .heroes()
            .await?
            .iter()
            .map(|h| AssetsHero {
                id: h.id,
                name: h.name.clone(),
            })
            .collect())
    }

    /// Ranks for the latest known client version.
    pub async fn fetch_ranks(&self) -> AssetsClientResult<Vec<AssetsRanks>> {
        debug!("Loading ranks from versioned assets");
        self.ranks()
            .await?
            .iter()
            .map(|r| {
                Ok(AssetsRanks {
                    tier: r.tier,
                    name: r.name.clone(),
                    images: images_to_map(&r.images)?,
                })
            })
            .collect()
    }

    /// Find a hero ID by name.
    pub async fn fetch_hero_id_from_name(
        &self,
        hero_name: &str,
    ) -> AssetsClientResult<Option<u32>> {
        debug!("Finding hero ID for name: {hero_name}");
        let needle = hero_name.to_lowercase();
        let prefixed = format!("hero_{needle}");
        Ok(self
            .heroes()
            .await?
            .iter()
            .find(|h| matches_hero_name(h, &needle, &prefixed))
            .map(|h| h.id))
    }

    /// Find a hero name by ID.
    pub async fn fetch_hero_name_from_id(
        &self,
        hero_id: u32,
    ) -> AssetsClientResult<Option<String>> {
        debug!("Finding hero name for ID: {hero_id}");
        Ok(self
            .heroes()
            .await?
            .iter()
            .find(|h| h.id == hero_id)
            .map(|h| h.name.clone()))
    }

    /// Validate if a hero ID exists.
    pub async fn validate_hero_id(&self, hero_id: u32) -> bool {
        match self.heroes().await {
            Ok(heroes) => heroes.iter().any(|h| h.id == hero_id),
            Err(e) => {
                warn!("Failed to load heroes: {e}, treating hero ID {hero_id} as invalid");
                false
            }
        }
    }

    /// Cached `Arc<Vec<Hero>>` for the latest version (shared underlying allocation).
    pub async fn heroes(&self) -> AssetsClientResult<Arc<Vec<Hero>>> {
        let version = self.latest_version().await?;
        build_heroes(&self.r2_client, version, DEFAULT_LANGUAGE)
            .await
            .map_err(|source| AssetsClientError::Build {
                what: "heroes",
                source,
            })
    }

    /// Cached `Arc<Vec<Rank>>` for the latest version (shared underlying allocation).
    pub async fn ranks(&self) -> AssetsClientResult<Arc<Vec<Rank>>> {
        let version = self.latest_version().await?;
        build_ranks(&self.r2_client, version, DEFAULT_LANGUAGE)
            .await
            .map_err(|source| AssetsClientError::Build {
                what: "ranks",
                source,
            })
    }

    /// Cached `Arc<Vec<Item>>` (abilities, weapons and upgrades) for the latest version.
    pub async fn items(&self) -> AssetsClientResult<Arc<Vec<Item>>> {
        let version = self.latest_version().await?;
        build_items(&self.r2_client, version, DEFAULT_LANGUAGE)
            .await
            .map_err(|source| AssetsClientError::Build {
                what: "items",
                source,
            })
    }

    /// Resolve the latest known client version, loading the listing on demand.
    async fn latest_version(&self) -> AssetsClientResult<u32> {
        self.version_store.ensure_loaded(&self.r2_client).await?;
        self.version_store
            .latest()
            .ok_or(AssetsClientError::NoVersions)
    }
}

/// Matches a hero by display `name` or `class_name`, case-insensitively, also
/// accepting the bare form against a `hero_`-prefixed class name. `needle` is
/// the lowercased search name and `prefixed` is `hero_{needle}`.
fn matches_hero_name(hero: &Hero, needle: &str, prefixed: &str) -> bool {
    let eq = |s: &str| {
        let s = s.to_lowercase();
        s == needle || s == prefixed
    };
    eq(&hero.name) || eq(&hero.class_name)
}

/// Flatten the typed [`RankImages`] into the `{key: url}` map shape the callers
/// look up by dynamic key (e.g. `large_webp`). Only present fields are
/// serialized, so absent images are simply missing from the map.
fn images_to_map(images: &RankImages) -> AssetsClientResult<HashMap<String, String>> {
    let value = serde_json::to_value(images)?;
    Ok(value.as_object().map_or_default(|obj| {
        obj.iter()
            .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_owned())))
            .collect()
    }))
}
