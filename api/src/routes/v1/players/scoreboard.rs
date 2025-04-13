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
    pub hero_id: Option<u32>,
    /// Filter by min number of matches played.
    pub min_matches: Option<u32>,
    /// Filter matches based on their start time (Unix timestamp).
    pub min_unix_timestamp: Option<u64>,
    /// Filter matches based on their start time (Unix timestamp).
    pub max_unix_timestamp: Option<u64>,
    /// Filter matches based on their duration in seconds (up to 7000s).
    #[param(maximum = 7000)]
    pub min_duration_s: Option<u64>,
    /// Filter matches based on their duration in seconds (up to 7000s).
    #[param(maximum = 7000)]
    pub max_duration_s: Option<u64>,
    /// Filter matches based on the average badge level (0-116) of *both* teams involved.
    #[param(minimum = 0, maximum = 116)]
    pub min_average_badge: Option<u8>,
    /// Filter matches based on the average badge level (0-116) of *both* teams involved.
    #[param(minimum = 0, maximum = 116)]
    pub max_average_badge: Option<u8>,
    /// Filter matches based on their ID.
    pub min_match_id: Option<u64>,
    /// Filter matches based on their ID.
    pub max_match_id: Option<u64>,
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
    let mut info_filters = vec![];
    if let Some(min_unix_timestamp) = query.min_unix_timestamp {
        info_filters.push(format!("start_time >= {}", min_unix_timestamp));
    }
    if let Some(max_unix_timestamp) = query.max_unix_timestamp {
        info_filters.push(format!("start_time <= {}", max_unix_timestamp));
    }
    if let Some(min_match_id) = query.min_match_id {
        info_filters.push(format!("match_id >= {}", min_match_id));
    }
    if let Some(max_match_id) = query.max_match_id {
        info_filters.push(format!("match_id <= {}", max_match_id));
    }
    if let Some(min_badge_level) = query.min_average_badge {
        info_filters.push(format!(
            "average_badge_team0 >= {} AND average_badge_team1 >= {}",
            min_badge_level, min_badge_level
        ));
    }
    if let Some(max_badge_level) = query.max_average_badge {
        info_filters.push(format!(
            "average_badge_team0 <= {} AND average_badge_team1 <= {}",
            max_badge_level, max_badge_level
        ));
    }
    if let Some(min_duration_s) = query.min_duration_s {
        info_filters.push(format!("duration_s >= {}", min_duration_s));
    }
    if let Some(max_duration_s) = query.max_duration_s {
        info_filters.push(format!("duration_s <= {}", max_duration_s));
    }
    let info_filters = if !info_filters.is_empty() {
        format!(" WHERE {} ", info_filters.join(" AND "))
    } else {
        "".to_owned()
    };
    let mut player_filters = vec![];
    if !info_filters.is_empty() {
        player_filters.push(format!(
            "match_id IN (SELECT match_id FROM match_info {}) ",
            info_filters
        ));
    }
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
    get_scoreboard(&state.ch_client, query).await.map(Json)
}
