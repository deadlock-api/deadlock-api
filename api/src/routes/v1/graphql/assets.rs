//! GraphQL asset resolvers: top-level `heroes`/`items`/`ranks` queries and
//! nested `MatchPlayer.hero` / `Item.asset` enrichment.

use std::sync::Arc;

use async_graphql::{ComplexObject, Context, Result as GqlResult};
use object_store::aws::AmazonS3;

use crate::context::AppState;
use crate::routes::v1::assets::common::{AssetsQuery, Language, load_localized};
use crate::routes::v1::graphql::schema::app_state;
use crate::routes::v1::graphql::types::{Item as GameplayItem, MatchPlayer};
use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::heroes::{Hero, fetch_heroes};
use crate::services::assets::versions::items::{Item as AssetItem, fetch_items};
use crate::services::assets::versions::ranks::{Rank, fetch_ranks};

/// Resolve version + language and run a cached asset builder, mapping the
/// REST-layer error into a GraphQL error. Reuses [`load_localized`].
async fn load_asset<T>(
    state: &AppState,
    client_version: Option<u32>,
    language: Option<Language>,
    label: &'static str,
    fetch: impl AsyncFnOnce(&AmazonS3, u32, &str) -> Result<T, AssetsError>,
) -> GqlResult<T> {
    let query = AssetsQuery {
        language,
        client_version,
    };
    load_localized(state, &query, label, fetch)
        .await
        .map_err(|e| async_graphql::Error::new(e.to_string()))
}

pub(super) async fn load_heroes(
    state: &AppState,
    client_version: Option<u32>,
    language: Option<Language>,
) -> GqlResult<Arc<Vec<Hero>>> {
    load_asset(state, client_version, language, "heroes", fetch_heroes).await
}

pub(super) async fn load_items(
    state: &AppState,
    client_version: Option<u32>,
    language: Option<Language>,
) -> GqlResult<Arc<Vec<AssetItem>>> {
    load_asset(state, client_version, language, "items", fetch_items).await
}

pub(super) async fn load_ranks(
    state: &AppState,
    client_version: Option<u32>,
    language: Option<Language>,
) -> GqlResult<Arc<Vec<Rank>>> {
    load_asset(state, client_version, language, "ranks", fetch_ranks).await
}

#[ComplexObject(rename_fields = "snake_case")]
impl MatchPlayer {
    /// Hero asset metadata for this player's `hero_id` (latest version, English).
    async fn hero(&self, ctx: &Context<'_>) -> GqlResult<Option<Hero>> {
        let Some(id) = self.hero_id else {
            return Ok(None);
        };
        let heroes = load_heroes(app_state(ctx)?, None, None).await?;
        Ok(heroes.iter().find(|h| h.id == id).cloned())
    }
}

#[ComplexObject(rename_fields = "snake_case")]
impl GameplayItem {
    /// Catalog asset for this purchased item, matched by `item_id` then `upgrade_id`.
    async fn asset(&self, ctx: &Context<'_>) -> GqlResult<Option<AssetItem>> {
        let Some(id) = self.item_id.or(self.upgrade_id) else {
            return Ok(None);
        };
        let items = load_items(app_state(ctx)?, None, None).await?;
        Ok(items.iter().find(|i| i.id() == id).cloned())
    }
}
