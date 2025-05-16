use crate::error::{APIError, APIResult};
use crate::state::AppState;
use crate::utils::parse::{
    comma_separated_num_deserialize, default_last_month_timestamp, parse_steam_id_option,
};
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use derive_more::Display;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};

#[derive(Deserialize, IntoParams)]
pub struct HeroIdQuery {
    pub hero_id: u32,
}

#[derive(
    Copy, Debug, Display, Clone, Serialize, Deserialize, ToSchema, Eq, PartialEq, Hash, Default,
)]
pub enum HeroStatsOverTimeQueryTimeInterval {
    #[default]
    #[display("HOUR")]
    HOUR,
    #[display("DAY")]
    DAY,
    #[display("WEEK")]
    WEEK,
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
pub struct HeroStatsOverTimeQuery {
    /// Comma separated list of hero ids to include
    #[serde(default, deserialize_with = "comma_separated_num_deserialize")]
    pub hero_ids: Vec<u32>,
    /// Time Interval for the stats. **Default:** HOUR.
    #[param(inline)]
    #[serde(default)]
    pub time_interval: HeroStatsOverTimeQueryTimeInterval,
    /// Filter matches based on their start time (Unix timestamp). **Default:** 30 days ago.
    #[serde(default = "default_last_month_timestamp")]
    #[param(default = default_last_month_timestamp)]
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
    /// Filter players based on the number of matches they have played with a specific hero.
    pub min_hero_matches: Option<u64>,
    /// Filter players based on the number of matches they have played with a specific hero.
    pub max_hero_matches: Option<u64>,
    /// Filter for matches with a specific player account ID.
    #[serde(default, deserialize_with = "parse_steam_id_option")]
    pub account_id: Option<u32>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct HeroStatsOverTime {
    pub hero_id: u32,
    pub date_time: u32,
    pub wins: u64,
    pub losses: u64,
    pub matches: u64,
    /// The total number of matches played at the given time, including matches where the hero did not play.
    pub total_matches: u64,
    pub players: u64,
    pub total_kills: u64,
    pub total_deaths: u64,
    pub total_assists: u64,
    pub total_net_worth: u64,
    pub total_last_hits: u64,
    pub total_denies: u64,
}

fn build_hero_stats_over_time_query(query: &HeroStatsOverTimeQuery) -> String {
    let mut info_filters = vec![];
    if let Some(min_unix_timestamp) = query.min_unix_timestamp {
        info_filters.push(format!("start_time >= {min_unix_timestamp}"));
    }
    if let Some(max_unix_timestamp) = query.max_unix_timestamp {
        info_filters.push(format!("start_time <= {max_unix_timestamp}"));
    }
    if let Some(min_match_id) = query.min_match_id {
        info_filters.push(format!("match_id >= {min_match_id}"));
    }
    if let Some(max_match_id) = query.max_match_id {
        info_filters.push(format!("match_id <= {max_match_id}"));
    }
    if let Some(min_badge_level) = query.min_average_badge {
        info_filters.push(format!(
            "average_badge_team0 >= {min_badge_level} AND average_badge_team1 >= {min_badge_level}"
        ));
    }
    if let Some(max_badge_level) = query.max_average_badge {
        info_filters.push(format!(
            "average_badge_team0 <= {max_badge_level} AND average_badge_team1 <= {max_badge_level}"
        ));
    }
    if let Some(min_duration_s) = query.min_duration_s {
        info_filters.push(format!("duration_s >= {min_duration_s}"));
    }
    if let Some(max_duration_s) = query.max_duration_s {
        info_filters.push(format!("duration_s <= {max_duration_s}"));
    }
    let info_filters = if info_filters.is_empty() {
        "".to_string()
    } else {
        format!(" AND {}", info_filters.join(" AND "))
    };
    let mut player_filters = vec![];
    player_filters.push(format!(
        "has([{}], hero_id)",
        query.hero_ids.iter().map(|i| i.to_string()).join(", ")
    ));
    if let Some(account_id) = query.account_id {
        player_filters.push(format!("account_id = {account_id}"));
    }
    let player_filters = if player_filters.is_empty() {
        "TRUE".to_string()
    } else {
        player_filters.join(" AND ")
    };
    let mut player_hero_filters = vec![];
    if let Some(min_hero_matches) = query.min_hero_matches {
        player_hero_filters.push(format!("COUNT(DISTINCT match_id) >= {min_hero_matches}"));
    }
    if let Some(max_hero_matches) = query.max_hero_matches {
        player_hero_filters.push(format!("COUNT(DISTINCT match_id) <= {max_hero_matches}"));
    }
    let player_hero_filters = if player_hero_filters.is_empty() {
        "TRUE".to_string()
    } else {
        player_hero_filters.join(" AND ")
    };
    let time_interval = query.time_interval.to_string();
    format!(
        r#"
    WITH t_matches AS (
            SELECT match_id, start_time
            FROM match_info
            WHERE match_mode IN ('Ranked', 'Unranked')
                {info_filters}
        ),
        {}
        matches_per_dt AS (
            SELECT toUnixTimestamp(toStartOfInterval(start_time, INTERVAL 1 {time_interval})) AS date_time, count() AS matches
            FROM t_matches
            GROUP BY date_time
        ),
        hero_stats_per_dt AS (
            SELECT
                hero_id,
                toUnixTimestamp(toStartOfInterval(start_time, INTERVAL 1 {time_interval})) AS date_time,
                sum(won) AS wins,
                sum(not won) AS losses,
                wins + losses AS matches,
                count(DISTINCT account_id) AS players,
                sum(kills) AS total_kills,
                sum(deaths) AS total_deaths,
                sum(assists) AS total_assists,
                sum(net_worth) AS total_net_worth,
                sum(last_hits) AS total_last_hits,
                sum(denies) AS total_denies
            FROM match_player FINAL
            INNER JOIN t_matches USING (match_id)
            WHERE {player_filters} {}
            GROUP BY hero_id, date_time
            HAVING COUNT() > 1
            ORDER BY hero_id, date_time
        )
    SELECT
        hero_id,
        date_time,
        wins,
        losses,
        matches,
        m.matches AS total_matches,
        players,
        total_kills,
        total_deaths,
        total_assists,
        total_net_worth,
        total_last_hits,
        total_denies
        FROM hero_stats_per_dt hs
        INNER JOIN matches_per_dt m ON hs.date_time = m.date_time
        ORDER BY date_time DESC
    "#,
        if query.min_hero_matches.or(query.max_hero_matches).is_some() {
            format!(
                r#"
        t_players AS (
            SELECT account_id, hero_id
            FROM match_player
            WHERE match_id IN (SELECT match_id FROM t_matches) AND {player_filters}
            GROUP BY account_id, hero_id
            HAVING {player_hero_filters}
        ),"#
            )
        } else {
            "".to_string()
        },
        if query.min_hero_matches.or(query.max_hero_matches).is_some() {
            "AND (account_id, hero_id) IN t_players"
        } else {
            ""
        }
    )
}

#[cached(
    ty = "TimedCache<String, Vec<HeroStatsOverTime>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = r#"{ format!("{:?}", query) }"#,
    sync_writes = "by_key",
    key = "String"
)]
pub async fn get_hero_stats_over_time(
    ch_client: &clickhouse::Client,
    query: HeroStatsOverTimeQuery,
) -> APIResult<Vec<HeroStatsOverTime>> {
    let query = build_hero_stats_over_time_query(&query);
    debug!(?query);
    ch_client.query(&query).fetch_all().await.map_err(|e| {
        warn!("Failed to fetch hero stats over time: {}", e);
        APIError::InternalError {
            message: format!("Failed to fetch hero stats over time: {e}"),
        }
    })
}

#[utoipa::path(
    get,
    path = "/hero-stats/over-time",
    params(HeroStatsOverTimeQuery),
    responses(
        (status = OK, description = "Heroes Stats Over Time", body = [HeroStatsOverTime]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch heroes stats over time")
    ),
    tags = ["Analytics"],
    summary = "Hero Stats Over Time",
    description = "Retrieves performance statistics for each hero based on historical match data over time."
)]
pub async fn heroes_stats_over_time(
    Query(query): Query<HeroStatsOverTimeQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_hero_stats_over_time(&state.ch_client, query)
        .await
        .map(Json)
}

pub async fn hero_stats_over_time(
    Path(HeroIdQuery { hero_id }): Path<HeroIdQuery>,
    Query(mut query): Query<HeroStatsOverTimeQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    query.hero_ids = vec![hero_id];
    get_hero_stats_over_time(&state.ch_client, query)
        .await
        .map(Json)
}
