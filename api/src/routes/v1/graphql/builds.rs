//! GraphQL access to the Postgres `hero_builds` table: the top-level
//! `hero_builds` query, the `MatchPlayer.hero_build` join (batched through a
//! [`DataLoader`]) and the asset / Steam enrichment on build types.

use std::collections::HashMap;
use std::sync::Arc;

use async_graphql::dataloader::{DataLoader, Loader};
use async_graphql::{ComplexObject, Context, InputObject, Result as GqlResult};
use sqlx::{Pool, Postgres, QueryBuilder};
use tracing::{Instrument as _, info_span};

use crate::context::AppState;
use crate::routes::v1::builds::query::{BuildLanguage, BuildsSearchQuery, BuildsSearchQuerySortBy};
use crate::routes::v1::builds::route::fetch_builds;
use crate::routes::v1::builds::structs::{
    Build, BuildHero, BuildHeroDetailsAbilityOrderCurrencyChange, BuildHeroDetailsCategoryAbility,
};
use crate::routes::v1::graphql::assets::{load_heroes, load_items, load_steam_profile};
use crate::routes::v1::graphql::cost::MAX_LIMIT;
use crate::routes::v1::graphql::schema::{OrderDirection, app_state};
use crate::routes::v1::graphql::types::SteamProfile;
use crate::services::assets::versions::heroes::Hero;
use crate::services::assets::versions::items::Item as AssetItem;
use crate::utils::types::SortDirectionDesc;

/// Filters for the `hero_builds` query. All set fields are AND-ed. Mirrors
/// the REST `/v1/builds` search parameters.
#[derive(Clone, Debug, Default, InputObject)]
#[graphql(rename_fields = "snake_case")]
pub(super) struct HeroBuildWhere {
    /// See more: <https://api.deadlock-api.com/v1/assets/heroes>
    hero_id: Option<u32>,
    build_id: Option<u32>,
    version: Option<u32>,
    /// The author's `SteamID3`.
    author_id: Option<u32>,
    language: Option<BuildLanguage>,
    tag: Option<u32>,
    rollup_category: Option<u32>,
    /// Case-insensitive substring match on the build name.
    search_name: Option<String>,
    /// Case-insensitive substring match on the build description.
    search_description: Option<String>,
    /// Only return the latest version of each build.
    only_latest: Option<bool>,
    /// Filter on `last_updated` (Unix timestamp).
    min_unix_timestamp: Option<i64>,
    /// Filter on `last_updated` (Unix timestamp).
    max_unix_timestamp: Option<i64>,
    /// Filter on the published time (Unix timestamp).
    min_published_unix_timestamp: Option<i64>,
    /// Filter on the published time (Unix timestamp).
    max_published_unix_timestamp: Option<i64>,
}

pub(super) struct HeroBuildsArgs {
    pub(super) where_: Option<HeroBuildWhere>,
    pub(super) order_by: Option<BuildsSearchQuerySortBy>,
    pub(super) order_direction: Option<OrderDirection>,
    pub(super) limit: u32,
    pub(super) offset: u32,
}

pub(super) async fn load_hero_builds(
    state: &AppState,
    args: HeroBuildsArgs,
) -> GqlResult<Vec<Build>> {
    let w = args.where_.unwrap_or_default();
    #[expect(deprecated)]
    let query = BuildsSearchQuery {
        hero_id: w.hero_id,
        build_id: w.build_id,
        version: w.version,
        author_id: w.author_id,
        build_language: w.language,
        language: None,
        tag: w.tag,
        rollup_category: w.rollup_category,
        search_name: w.search_name,
        search_description: w.search_description,
        only_latest: w.only_latest,
        min_unix_timestamp: w.min_unix_timestamp,
        max_unix_timestamp: w.max_unix_timestamp,
        min_published_unix_timestamp: w.min_published_unix_timestamp,
        max_published_unix_timestamp: w.max_published_unix_timestamp,
        sort_by: args.order_by.unwrap_or_default(),
        sort_direction: match args.order_direction.unwrap_or_default() {
            OrderDirection::Desc => SortDirectionDesc::Desc,
            OrderDirection::Asc => SortDirectionDesc::Asc,
        },
        limit: Some(args.limit.clamp(1, MAX_LIMIT)),
        start: Some(args.offset),
    };
    let rows = fetch_builds(&state.pg_client, &query)
        .instrument(info_span!("graphql.postgres", operation = "hero_builds"))
        .await
        .map_err(|e| async_graphql::Error::new(format!("Postgres error: {e}")))?;
    #[expect(clippy::cast_precision_loss)]
    metrics::histogram!("graphql_rows_returned", "operation" => "hero_builds")
        .record(rows.len() as f64);
    Ok(rows)
}

/// Batches `(hero_id, build_id)` lookups from nested `hero_build` resolvers
/// into one Postgres query per request, returning the latest version of each.
pub(super) struct HeroBuildLoader {
    pg_client: Pool<Postgres>,
}

impl HeroBuildLoader {
    pub(super) fn new(pg_client: Pool<Postgres>) -> Self {
        Self { pg_client }
    }
}

impl Loader<(u32, u32)> for HeroBuildLoader {
    type Value = Build;
    type Error = Arc<sqlx::Error>;

    async fn load(&self, keys: &[(u32, u32)]) -> Result<HashMap<(u32, u32), Build>, Self::Error> {
        let mut qb: QueryBuilder<Postgres> = QueryBuilder::new(
            "SELECT DISTINCT ON (hero, build_id) data FROM hero_builds WHERE (hero, build_id) IN ",
        );
        #[expect(clippy::cast_possible_wrap)]
        qb.push_tuples(keys, |mut b, (hero_id, build_id)| {
            b.push_bind(*hero_id as i32).push_bind(*build_id as i32);
        });
        qb.push(" ORDER BY hero, build_id, version DESC");
        let rows: Vec<sqlx::types::Json<Build>> = qb
            .build_query_scalar()
            .fetch_all(&self.pg_client)
            .instrument(info_span!(
                "graphql.postgres",
                operation = "hero_build_loader"
            ))
            .await
            .map_err(Arc::new)?;
        Ok(rows
            .into_iter()
            .map(|r| ((r.0.hero_build.hero_id, r.0.hero_build.hero_build_id), r.0))
            .collect())
    }
}

pub(super) async fn load_hero_build(
    ctx: &Context<'_>,
    hero_id: u32,
    build_id: u32,
) -> GqlResult<Option<Build>> {
    ctx.data_unchecked::<DataLoader<HeroBuildLoader>>()
        .load_one((hero_id, build_id))
        .await
        .map_err(|e| async_graphql::Error::new(format!("Postgres error: {e}")))
}

#[ComplexObject(rename_fields = "snake_case")]
impl BuildHero {
    /// Hero asset metadata for this build's `hero_id` (latest version, English).
    async fn hero(&self, ctx: &Context<'_>) -> GqlResult<Option<Hero>> {
        let heroes = load_heroes(app_state(ctx)?, None, None).await?;
        Ok(heroes.iter().find(|h| h.id == self.hero_id).cloned())
    }

    /// Stored Steam profile of the build author (no live Steam fetch). `null`
    /// for protected users and accounts without a stored profile.
    async fn author(&self, ctx: &Context<'_>) -> GqlResult<Option<SteamProfile>> {
        load_steam_profile(app_state(ctx)?, self.author_account_id).await
    }
}

#[ComplexObject(rename_fields = "snake_case")]
impl BuildHeroDetailsCategoryAbility {
    /// Catalog asset for this build slot's `ability_id`.
    async fn asset(&self, ctx: &Context<'_>) -> GqlResult<Option<AssetItem>> {
        let items = load_items(app_state(ctx)?, None, None).await?;
        Ok(items.iter().find(|i| i.id() == self.ability_id).cloned())
    }
}

#[ComplexObject(rename_fields = "snake_case")]
impl BuildHeroDetailsAbilityOrderCurrencyChange {
    /// Catalog asset for this currency change's `ability_id`.
    async fn asset(&self, ctx: &Context<'_>) -> GqlResult<Option<AssetItem>> {
        let items = load_items(app_state(ctx)?, None, None).await?;
        Ok(items.iter().find(|i| i.id() == self.ability_id).cloned())
    }
}
