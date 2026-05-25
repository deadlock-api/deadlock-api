use std::collections::HashMap;
use std::sync::Arc;

use object_store::aws::AmazonS3;
use tracing::{debug, warn};

use crate::error::{APIError, APIResult};
use crate::services::assets::types::{AssetsHero, AssetsRanks};
use crate::services::assets::versions::heroes::{Hero, fetch_heroes as build_heroes};
use crate::services::assets::versions::ranks::{RankImages, fetch_ranks as build_ranks};
use crate::services::assets::versions::store::VersionStore;

/// Language the internal lookups resolve hero/rank names in. The streamkit
/// commands and analytics validators only need English display names.
const DEFAULT_LANGUAGE: &str = "english";

/// Loads hero/rank metadata directly from the versioned R2 assets.
///
/// Previously this hit the standalone assets API over HTTP; now that the asset
/// pipeline lives in this service we build the same data in-process from the
/// latest published game version. The underlying `build_*` functions are cached
/// per `(version, language)`, so repeated calls don't re-parse the source files.
#[derive(Clone)]
pub(crate) struct AssetsClient {
    r2_client: AmazonS3,
    version_store: VersionStore,
}

impl AssetsClient {
    pub(crate) fn new(r2_client: AmazonS3, version_store: VersionStore) -> Self {
        Self {
            r2_client,
            version_store,
        }
    }

    /// Heroes for the latest known client version.
    pub(crate) async fn fetch_heroes(&self) -> APIResult<Vec<AssetsHero>> {
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
    pub(crate) async fn fetch_ranks(&self) -> APIResult<Vec<AssetsRanks>> {
        debug!("Loading ranks from versioned assets");
        let version = self.latest_version().await?;
        let ranks = build_ranks(&self.r2_client, version, DEFAULT_LANGUAGE)
            .await
            .map_err(|e| APIError::internal(format!("building ranks: {e}")))?;
        ranks
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
    pub(crate) async fn fetch_hero_id_from_name(&self, hero_name: &str) -> APIResult<Option<u32>> {
        debug!("Finding hero ID for name: {hero_name}");
        Ok(self
            .heroes()
            .await?
            .iter()
            .find(|h| matches_hero_name(h, hero_name))
            .map(|h| h.id))
    }

    /// Find a hero name by ID.
    pub(crate) async fn fetch_hero_name_from_id(&self, hero_id: u32) -> APIResult<Option<String>> {
        debug!("Finding hero name for ID: {hero_id}");
        Ok(self
            .heroes()
            .await?
            .iter()
            .find(|h| h.id == hero_id)
            .map(|h| h.name.clone()))
    }

    /// Validate if a hero ID exists.
    pub(crate) async fn validate_hero_id(&self, hero_id: u32) -> bool {
        match self.heroes().await {
            Ok(heroes) => heroes.iter().any(|h| h.id == hero_id),
            Err(e) => {
                warn!("Failed to load heroes: {e}, treating hero ID {hero_id} as invalid");
                false
            }
        }
    }

    /// Cached `Arc<Vec<Hero>>` for the latest version (shared underlying allocation).
    async fn heroes(&self) -> APIResult<Arc<Vec<Hero>>> {
        let version = self.latest_version().await?;
        build_heroes(&self.r2_client, version, DEFAULT_LANGUAGE)
            .await
            .map_err(|e| APIError::internal(format!("building heroes: {e}")))
    }

    /// Resolve the latest known client version, loading the listing on demand.
    async fn latest_version(&self) -> APIResult<u32> {
        self.version_store
            .ensure_loaded(&self.r2_client)
            .await
            .map_err(|e| APIError::internal(format!("version listing: {e}")))?;
        self.version_store
            .latest()
            .ok_or_else(|| APIError::internal("no asset versions available"))
    }
}

/// Matches a hero by display `name` or `class_name`, case-insensitively, also
/// accepting the bare form against a `hero_`-prefixed class name.
fn matches_hero_name(hero: &Hero, needle: &str) -> bool {
    let needle = needle.to_lowercase();
    let prefixed = format!("hero_{needle}");
    let eq = |s: &str| {
        let s = s.to_lowercase();
        s == needle || s == prefixed
    };
    eq(&hero.name) || eq(&hero.class_name)
}

/// Flatten the typed [`RankImages`] into the `{key: url}` map shape the callers
/// look up by dynamic key (e.g. `large_subrank3_webp`). Only present fields are
/// serialized, so absent images are simply missing from the map.
fn images_to_map(images: &RankImages) -> APIResult<HashMap<String, String>> {
    let value = serde_json::to_value(images)
        .map_err(|e| APIError::internal(format!("serializing rank images: {e}")))?;
    Ok(value
        .as_object()
        .map(|obj| {
            obj.iter()
                .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_owned())))
                .collect()
        })
        .unwrap_or_default())
}
