//! GraphQL schema entry point: `QueryRoot.matches` and `QueryRoot.match_players`.

#![allow(clippy::doc_markdown)]

use std::sync::Arc;

use async_graphql::{
    Context, EmptyMutation, EmptySubscription, Enum, Object, Result as GqlResult, Schema,
};
use tokio::io::AsyncBufReadExt as _;
use tracing::{Instrument as _, debug, info_span};

use crate::context::AppState;
use crate::routes::v1::assets::common::Language;
use crate::routes::v1::graphql::assets::{load_heroes, load_items, load_ranks};
use crate::routes::v1::graphql::cost::{COMPLEXITY_LIMIT, DEPTH_LIMIT, MAX_LIMIT};
use crate::routes::v1::graphql::filters::MatchPlayerWhere;
use crate::routes::v1::graphql::metrics_ext::MetricsExtension;
use crate::routes::v1::graphql::projection::{project_match_players, project_matches};
use crate::routes::v1::graphql::sql::{
    BuildArgs, OrderDir, OrderKey, build_match_players_query, build_matches_query,
};
use crate::routes::v1::graphql::types::{Match, MatchPlayer};
use crate::services::assets::versions::heroes::Hero;
use crate::services::assets::versions::items::Item as AssetItem;
use crate::services::assets::versions::ranks::Rank;

pub(super) fn app_state<'a>(ctx: &'a Context<'_>) -> GqlResult<&'a AppState> {
    ctx.data::<AppState>()
        .map_err(|e| async_graphql::Error::new(format!("Internal: missing AppState: {e:?}")))
}

pub(crate) type GraphQLSchema = Schema<QueryRoot, EmptyMutation, EmptySubscription>;

pub(crate) fn build_schema() -> GraphQLSchema {
    Schema::build(QueryRoot, EmptyMutation, EmptySubscription)
        .limit_depth(DEPTH_LIMIT)
        .limit_complexity(COMPLEXITY_LIMIT)
        .extension(MetricsExtension)
        .finish()
}

#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug)]
pub(super) enum OrderByMatch {
    MatchId,
    StartTime,
    AverageBadge,
}

impl From<OrderByMatch> for OrderKey {
    fn from(v: OrderByMatch) -> Self {
        match v {
            OrderByMatch::MatchId => Self::MatchId,
            OrderByMatch::StartTime => Self::StartTime,
            OrderByMatch::AverageBadge => Self::AverageBadge,
        }
    }
}

#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug)]
pub(super) enum OrderByMatchPlayer {
    MatchId,
    AccountId,
    StartTime,
}

impl From<OrderByMatchPlayer> for OrderKey {
    fn from(v: OrderByMatchPlayer) -> Self {
        match v {
            OrderByMatchPlayer::MatchId => Self::MatchId,
            OrderByMatchPlayer::AccountId => Self::AccountId,
            OrderByMatchPlayer::StartTime => Self::StartTime,
        }
    }
}

#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug, Default)]
pub(super) enum OrderDirection {
    #[default]
    Desc,
    Asc,
}

impl From<OrderDirection> for OrderDir {
    fn from(v: OrderDirection) -> Self {
        match v {
            OrderDirection::Desc => Self::Desc,
            OrderDirection::Asc => Self::Asc,
        }
    }
}

pub(crate) struct QueryRoot;

#[Object(rename_fields = "snake_case", rename_args = "snake_case")]
impl QueryRoot {
    /// Match-grouped query — one node per match_id with players aggregated.
    async fn matches(
        &self,
        ctx: &Context<'_>,
        #[graphql(name = "where")] where_: Option<MatchPlayerWhere>,
        order_by: Option<OrderByMatch>,
        order_direction: Option<OrderDirection>,
        #[graphql(default = 100)] limit: u32,
        #[graphql(default = 0)] offset: u32,
    ) -> GqlResult<Vec<Match>> {
        let state = app_state(ctx)?;
        let projection = project_matches(&ctx.look_ahead());
        let filters = where_.map(|w| w.to_sql_filters()).unwrap_or_default();
        let sql = build_matches_query(&BuildArgs {
            projection: &projection,
            filters: &filters,
            order_by: order_by.unwrap_or(OrderByMatch::MatchId).into(),
            order_dir: order_direction.unwrap_or_default().into(),
            limit: limit.clamp(1, MAX_LIMIT),
            offset,
        })
        .map_err(|e| async_graphql::Error::new(format!("SQL build error: {e}")))?;
        debug!(?sql, "graphql.matches built sql");
        let rows = run_query::<Match>(&state.ch_client_ro, &sql)
            .instrument(info_span!("graphql.clickhouse", operation = "matches", sql = %sql))
            .await?;
        #[allow(clippy::cast_precision_loss)]
        metrics::histogram!("graphql_rows_returned", "operation" => "matches")
            .record(rows.len() as f64);
        Ok(rows)
    }

    /// Player-row query — one node per (match_id, account_id).
    async fn match_players(
        &self,
        ctx: &Context<'_>,
        #[graphql(name = "where")] where_: Option<MatchPlayerWhere>,
        order_by: Option<OrderByMatchPlayer>,
        order_direction: Option<OrderDirection>,
        #[graphql(default = 100)] limit: u32,
        #[graphql(default = 0)] offset: u32,
    ) -> GqlResult<Vec<MatchPlayer>> {
        let state = app_state(ctx)?;
        let projection = project_match_players(&ctx.look_ahead());
        let filters = where_.map(|w| w.to_sql_filters()).unwrap_or_default();
        let sql = build_match_players_query(&BuildArgs {
            projection: &projection,
            filters: &filters,
            order_by: order_by.unwrap_or(OrderByMatchPlayer::MatchId).into(),
            order_dir: order_direction.unwrap_or_default().into(),
            limit: limit.clamp(1, MAX_LIMIT),
            offset,
        })
        .map_err(|e| async_graphql::Error::new(format!("SQL build error: {e}")))?;
        debug!(?sql, "graphql.match_players built sql");
        let rows = run_query::<MatchPlayer>(&state.ch_client_ro, &sql)
            .instrument(info_span!("graphql.clickhouse", operation = "match_players", sql = %sql))
            .await?;
        #[allow(clippy::cast_precision_loss)]
        metrics::histogram!("graphql_rows_returned", "operation" => "match_players")
            .record(rows.len() as f64);
        Ok(rows)
    }

    /// All heroes for the given client version (defaults to latest), localized
    /// to `language` (defaults to English). Sourced from the versioned assets,
    /// not ClickHouse.
    #[graphql(complexity = "100 + 10 * child_complexity")]
    async fn heroes(
        &self,
        ctx: &Context<'_>,
        client_version: Option<u32>,
        language: Option<Language>,
    ) -> GqlResult<Arc<Vec<Hero>>> {
        load_heroes(app_state(ctx)?, client_version, language).await
    }

    /// All items (abilities, weapons, upgrades) for the given client version
    /// (defaults to latest), localized to `language` (defaults to English).
    #[graphql(complexity = "100 + 10 * child_complexity")]
    async fn items(
        &self,
        ctx: &Context<'_>,
        client_version: Option<u32>,
        language: Option<Language>,
    ) -> GqlResult<Arc<Vec<AssetItem>>> {
        load_items(app_state(ctx)?, client_version, language).await
    }

    /// All rank tiers for the given client version (defaults to latest),
    /// localized to `language` (defaults to English).
    #[graphql(complexity = "50 + 10 * child_complexity")]
    async fn ranks(
        &self,
        ctx: &Context<'_>,
        client_version: Option<u32>,
        language: Option<Language>,
    ) -> GqlResult<Arc<Vec<Rank>>> {
        load_ranks(app_state(ctx)?, client_version, language).await
    }
}

async fn run_query<T>(ch_client: &clickhouse::Client, sql: &str) -> GqlResult<Vec<T>>
where
    T: serde::de::DeserializeOwned,
{
    let cursor = ch_client
        .query(sql)
        .fetch_bytes("JSONEachRow")
        .map_err(|e| async_graphql::Error::new(format!("ClickHouse error: {e}")))?;
    let mut lines = cursor.lines();
    let mut out: Vec<T> = Vec::new();
    while let Some(line) = lines
        .next_line()
        .await
        .map_err(|e| async_graphql::Error::new(format!("ClickHouse read error: {e}")))?
    {
        let value: T = serde_json::from_str(&line)
            .map_err(|e| async_graphql::Error::new(format!("Row decode error: {e}")))?;
        out.push(value);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schema_builds_with_assets() {
        // Panics on duplicate type names / invalid output types.
        let sdl = build_schema().sdl();
        assert!(sdl.contains("type Hero"));
        assert!(sdl.contains("union AssetItem"));
        assert!(sdl.contains("type Rank"));
        assert!(sdl.contains("heroes("));
        assert!(sdl.contains("hero:")); // MatchPlayer.hero enrichment
        assert!(sdl.contains("asset:")); // Item.asset enrichment
    }
}
