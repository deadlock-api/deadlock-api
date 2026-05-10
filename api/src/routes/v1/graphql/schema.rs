//! GraphQL schema entry point: `QueryRoot.matches` and `QueryRoot.match_players`.

#![allow(clippy::doc_markdown)]

use async_graphql::{
    Context, EmptyMutation, EmptySubscription, Enum, Object, Result as GqlResult, Schema,
};
use tokio::io::AsyncBufReadExt as _;
use tracing::{Instrument as _, debug, info_span};

use crate::context::AppState;
use crate::routes::v1::graphql::cost::{COMPLEXITY_LIMIT, DEPTH_LIMIT, MAX_LIMIT};
use crate::routes::v1::graphql::filters::MatchPlayerWhere;
use crate::routes::v1::graphql::metrics_ext::MetricsExtension;
use crate::routes::v1::graphql::projection::{project_match_players, project_matches};
use crate::routes::v1::graphql::sql::{
    BuildArgs, OrderDir, OrderKey, build_match_players_query, build_matches_query,
};
use crate::routes::v1::graphql::types::{Match, MatchPlayer};

fn app_state<'a>(ctx: &'a Context<'_>) -> GqlResult<&'a AppState> {
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
        metrics::histogram!("graphql_rows_returned", "operation" => "match_players")
            .record(rows.len() as f64);
        Ok(rows)
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
