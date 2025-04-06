use crate::error::{APIError, APIResult};
use crate::state::AppState;
use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use derive_more::Display;
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};

fn default_limit() -> Option<u32> {
    100.into()
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema, Default, Display)]
#[serde(rename_all = "snake_case")]
pub enum ScoreboardQuerySortBy {
    /// Sort by the most kills per match
    #[default]
    #[display("kills_per_match")]
    KillsPerMatch,
    /// Sort by the winrate
    #[display("winrate")]
    Winrate,
    /// Sort by the number of wins
    #[display("wins")]
    Wins,
    /// Sort by the number of losses
    #[display("losses")]
    Losses,
    /// Sort by the number of matches
    #[display("matches")]
    Matches,
    /// Sort by the most deaths per match
    #[display("deaths_per_match")]
    DeathsPerMatch,
    /// Sort by the most kills per match
    #[display("kills")]
    Kills,
    /// Sort by the most deaths per match
    #[display("deaths")]
    Deaths,
}

impl ScoreboardQuerySortBy {
    pub fn get_select_clause(&self) -> &'static str {
        match self {
            Self::KillsPerMatch => "max(kills)",
            Self::DeathsPerMatch => "max(deaths)",
            Self::Kills => "sum(kills)",
            Self::Deaths => "sum(deaths)",
            Self::Winrate => "sum(won) / count(distinct match_id)",
            Self::Wins => "sum(won)",
            Self::Losses => "sum(not won)",
            Self::Matches => "count(distinct match_id)",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema, Default, Display)]
#[serde(rename_all = "snake_case")]
pub enum ScoreboardQuerySortDirection {
    /// Sort in descending order.
    #[default]
    #[display("desc")]
    Desc,
    /// Sort in ascending order.
    #[display("asc")]
    Asc,
}

#[derive(Debug, Clone, Serialize, Deserialize, IntoParams)]
pub struct ScoreboardQuery {
    /// Filter matches based on the hero ID.
    hero_id: Option<u32>,
    /// Filter by minimum number of matches played.
    min_matches: Option<u32>,
    /// The field to sort by.
    #[serde(default)]
    #[param(inline)]
    pub sort_by: ScoreboardQuerySortBy,
    /// The direction to sort players in.
    #[serde(default)]
    #[param(inline)]
    pub sort_direction: ScoreboardQuerySortDirection,
    /// The offset to start fetching players from.
    pub start: Option<u32>,
    /// The maximum number of players to fetch.
    #[serde(default = "default_limit")]
    #[param(inline, default = "100", maximum = 10000, minimum = 1)]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct ScoreboardEntry {
    pub rank: u64,
    pub account_id: u32,
    pub value: f64,
}

#[cached(
    ty = "TimedCache<String, Vec<ScoreboardEntry>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = r#"{ format!("{:?}", query) }"#,
    sync_writes = "by_key",
    key = "String"
)]
async fn get_scoreboard(
    ch_client: &clickhouse::Client,
    query: ScoreboardQuery,
) -> APIResult<Vec<ScoreboardEntry>> {
    let mut player_filters = vec![];
    if let Some(hero_id) = query.hero_id {
        player_filters.push(format!("hero_id = {}", hero_id));
    }
    let player_filters = if !player_filters.is_empty() {
        format!(" WHERE {} ", player_filters.join(" AND "))
    } else {
        "".to_owned()
    };
    let mut player_having = vec![];
    if let Some(min_matches) = query.min_matches {
        player_having.push(format!("count(distinct match_id) >= {}", min_matches));
    }
    let player_having = if !player_having.is_empty() {
        format!(" HAVING {} ", player_having.join(" AND "))
    } else {
        "".to_owned()
    };
    let query = format!(
        r#"
SELECT rowNumberInAllBlocks() + {} as rank, account_id, toFloat64({}) as value
FROM match_player
{}
GROUP BY account_id
{}
ORDER BY value {}
LIMIT {} OFFSET {}
    "#,
        query.start.unwrap_or_default() + 1,
        query.sort_by.get_select_clause(),
        player_filters,
        player_having,
        query.sort_direction,
        query.limit.unwrap_or_default(),
        query.start.unwrap_or_default() + 1,
    );
    debug!(?query);
    ch_client.query(&query).fetch_all().await.map_err(|e| {
        warn!("Failed to fetch scoreboard: {}", e);
        APIError::InternalError {
            message: format!("Failed to fetch scoreboard: {}", e),
        }
    })
}

#[utoipa::path(
    get,
    path = "/scoreboard",
    params(ScoreboardQuery),
    responses(
        (status = OK, description = "Scoreboard", body = [ScoreboardEntry]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch scoreboard")
    ),
    tags = ["Players"],
    summary = "Scoreboard",
    description = "This endpoint returns the scoreboard."
)]
pub async fn scoreboard(
    Query(query): Query<ScoreboardQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_scoreboard(&state.clickhouse_client, query)
        .await
        .map(Json)
}
