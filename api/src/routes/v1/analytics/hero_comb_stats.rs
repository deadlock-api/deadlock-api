use crate::error::{APIError, APIResult};
use crate::state::AppState;
use crate::utils::parse::{
    comma_separated_num_deserialize, default_last_month_timestamp, parse_steam_id_option,
};
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ops::AddAssign;
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};

fn default_min_matches() -> Option<u32> {
    20.into()
}

fn default_comb_size() -> Option<u8> {
    6.into()
}

#[derive(Debug, Clone, Deserialize, IntoParams, Default)]
pub struct HeroCombStatsQuery {
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
    /// Filter for matches with a specific player account ID.
    #[serde(default, deserialize_with = "parse_steam_id_option")]
    pub account_id: Option<u32>,
    /// Comma separated list of hero ids to include
    #[serde(default, deserialize_with = "comma_separated_num_deserialize")]
    pub include_hero_ids: Option<Vec<u32>>,
    /// Comma separated list of hero ids to exclude
    #[serde(default, deserialize_with = "comma_separated_num_deserialize")]
    pub exclude_hero_ids: Option<Vec<u32>>,
    /// The minimum number of matches played for a hero combination to be included in the response.
    #[serde(default = "default_min_matches")]
    #[param(minimum = 1, default = 20)]
    pub min_matches: Option<u32>,
    /// The combination size to return.
    #[serde(default = "default_comb_size")]
    #[param(minimum = 2, maximum = 6, default = 6)]
    pub comb_size: Option<u8>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct HeroCombStats {
    pub hero_ids: Vec<u32>,
    pub wins: u64,
    pub losses: u64,
    pub matches: u64,
}

impl AddAssign for HeroCombStats {
    fn add_assign(&mut self, rhs: Self) {
        self.wins += rhs.wins;
        self.losses += rhs.losses;
        self.matches += rhs.matches;
    }
}

fn build_comb_hero_query(query: &HeroCombStatsQuery) -> String {
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
    if let Some(account_id) = query.account_id {
        player_filters.push(format!("has(account_ids, {account_id})"));
    }
    let player_filters = if player_filters.is_empty() {
        "".to_string()
    } else {
        format!(" AND {}", player_filters.join(" AND "))
    };
    let mut hero_filters = vec![];
    if let Some(include_hero_ids) = &query.include_hero_ids {
        hero_filters.push(format!(
            "hasAll(hero_ids, [{}])",
            include_hero_ids
                .iter()
                .map(|id| id.to_string())
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }
    if let Some(exclude_hero_ids) = &query.exclude_hero_ids {
        hero_filters.push(format!(
            "not hasAny(hero_ids, [{}])",
            exclude_hero_ids
                .iter()
                .map(|id| id.to_string())
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }
    let hero_filters = if hero_filters.is_empty() {
        "".to_string()
    } else {
        format!(" AND {}", hero_filters.join(" AND "))
    };
    format!(
        r#"
WITH hero_combinations AS (
    SELECT
        groupArraySorted(6)(hero_id) AS hero_ids,
        groupArray(account_id) AS account_ids,
        any(won) AS won
    FROM match_player FINAL
    INNER JOIN match_info mi USING (match_id)
    WHERE mi.match_outcome = 'TeamWin'
      AND mi.match_mode IN ('Ranked', 'Unranked')
      AND mi.game_mode = 'Normal' {}
    GROUP BY match_id, team
    HAVING length(hero_ids) = 6
)
SELECT
    hero_ids,
    sum(won) AS wins,
    sum(not won) AS losses,
    wins + losses AS matches
FROM hero_combinations
WHERE true {} {}
GROUP BY hero_ids
HAVING matches >= {}
ORDER BY wins / greatest(1, matches) DESC
    "#,
        info_filters,
        player_filters,
        hero_filters,
        if query.comb_size.or(default_comb_size()).unwrap_or_default() == 6 {
            query
                .min_matches
                .or(default_min_matches())
                .unwrap_or_default()
        } else {
            0
        }
    )
}

#[cached(
    ty = "TimedCache<String, Vec<HeroCombStats>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = r#"{ format!("{:?}", query) }"#,
    sync_writes = "by_key",
    key = "String"
)]
pub async fn get_comb_stats(
    ch_client: &clickhouse::Client,
    query: HeroCombStatsQuery,
) -> APIResult<Vec<HeroCombStats>> {
    let ch_query = build_comb_hero_query(&query);
    debug!(?query);
    let comb_stats: Vec<HeroCombStats> =
        ch_client.query(&ch_query).fetch_all().await.map_err(|e| {
            warn!("Failed to fetch hero comb stats: {}", e);
            APIError::InternalError {
                message: format!("Failed to fetch hero comb stats: {e}"),
            }
        })?;
    let comb_size = match query.comb_size {
        Some(6) => return Ok(comb_stats),
        Some(x) if !(2..=6).contains(&x) => {
            return Err(APIError::StatusMsg {
                status: StatusCode::BAD_REQUEST,
                message: "Combination size must be between 2 and 6".to_string(),
            });
        }
        Some(x) => x,
        None => return Ok(comb_stats),
    };
    let mut comb_stats_agg = HashMap::new();
    for comb_stat in comb_stats.iter() {
        for comb_hero_ids in comb_stat.hero_ids.iter().combinations(comb_size as usize) {
            *comb_stats_agg
                .entry(comb_hero_ids.to_vec())
                .or_insert(HeroCombStats {
                    hero_ids: comb_hero_ids.into_iter().cloned().collect_vec(),
                    wins: 0,
                    losses: 0,
                    matches: 0,
                }) += comb_stat.clone();
        }
    }
    Ok(comb_stats_agg
        .into_values()
        .filter(|c| {
            c.matches
                >= query
                    .min_matches
                    .or(default_min_matches())
                    .unwrap_or_default() as u64
        })
        .sorted_by_key(|c| c.wins / c.matches)
        .rev()
        .collect())
}

#[utoipa::path(
    get,
    path = "/hero-comb-stats",
    params(HeroCombStatsQuery),
    responses(
        (status = OK, description = "Hero Comb Stats", body = [HeroCombStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero comb stats")
    ),
    tags = ["Analytics"],
    summary = "Hero Comb Stats",
    description = r#"
Retrieves overall statistics for each hero combination.

Results are cached for **1 hour**. The cache key is determined by the specific combination of filter parameters used in the query. Subsequent requests using the exact same filters within this timeframe will receive the cached response.
    "#
)]
pub async fn hero_comb_stats(
    Query(query): Query<HeroCombStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_comb_stats(&state.ch_client, query).await.map(Json)
}

#[cfg(test)]
mod test {
    #![allow(clippy::too_many_arguments)]
    use super::*;

    #[test]
    fn test_build_comb_hero_query_min_unix_timestamp() {
        let min_unix_timestamp = Some(1672531200);
        let comb_query = HeroCombStatsQuery {
            min_unix_timestamp,
            ..Default::default()
        };
        let query = build_comb_hero_query(&comb_query);
        assert!(query.contains("start_time >= 1672531200"));
    }

    #[test]
    fn test_build_comb_hero_query_max_unix_timestamp() {
        let max_unix_timestamp = Some(1675209599);
        let comb_query = HeroCombStatsQuery {
            max_unix_timestamp,
            ..Default::default()
        };
        let query = build_comb_hero_query(&comb_query);
        assert!(query.contains("start_time <= 1675209599"));
    }

    #[test]
    fn test_build_comb_hero_query_min_duration_s() {
        let min_duration_s = Some(600);
        let comb_query = HeroCombStatsQuery {
            min_duration_s,
            ..Default::default()
        };
        let query = build_comb_hero_query(&comb_query);
        assert!(query.contains("duration_s >= 600"));
    }

    #[test]
    fn test_build_comb_hero_query_max_duration_s() {
        let max_duration_s = Some(1800);
        let comb_query = HeroCombStatsQuery {
            max_duration_s,
            ..Default::default()
        };
        let query = build_comb_hero_query(&comb_query);
        assert!(query.contains("duration_s <= 1800"));
    }

    #[test]
    fn test_build_comb_hero_query_min_average_badge() {
        let min_average_badge = Some(1);
        let comb_query = HeroCombStatsQuery {
            min_average_badge,
            ..Default::default()
        };
        let query = build_comb_hero_query(&comb_query);
        assert!(query.contains("average_badge_team0 >= 1 AND average_badge_team1 >= 1"));
    }

    #[test]
    fn test_build_comb_hero_query_max_average_badge() {
        let max_average_badge = Some(116);
        let comb_query = HeroCombStatsQuery {
            max_average_badge,
            ..Default::default()
        };
        let query = build_comb_hero_query(&comb_query);
        assert!(query.contains("average_badge_team0 <= 116 AND average_badge_team1 <= 116"));
    }

    #[test]
    fn test_build_comb_hero_query_min_match_id() {
        let min_match_id = Some(10000);
        let comb_query = HeroCombStatsQuery {
            min_match_id,
            ..Default::default()
        };
        let query = build_comb_hero_query(&comb_query);
        assert!(query.contains("match_id >= 10000"));
    }

    #[test]
    fn test_build_comb_hero_query_max_match_id() {
        let max_match_id = Some(1000000);
        let comb_query = HeroCombStatsQuery {
            max_match_id,
            ..Default::default()
        };
        let query = build_comb_hero_query(&comb_query);
        assert!(query.contains("match_id <= 1000000"));
    }

    #[test]
    fn test_build_comb_hero_query_account_id() {
        let account_id = Some(18373975);
        let comb_query = HeroCombStatsQuery {
            account_id,
            ..Default::default()
        };
        let query = build_comb_hero_query(&comb_query);
        assert!(query.contains("has(account_ids, 18373975)"));
    }

    #[test]
    fn test_build_comb_hero_query_include_hero_ids() {
        let include_hero_ids = vec![1, 2, 3];
        let comb_query = HeroCombStatsQuery {
            include_hero_ids: include_hero_ids.clone().into(),
            ..Default::default()
        };
        let query = build_comb_hero_query(&comb_query);
        assert!(query.contains(&format!(
                            "hasAll(hero_ids, [{}])",
                            include_hero_ids.iter()
                                .map(|id| id.to_string())
                                .collect::<Vec<_>>()
                                .join(", ")
                        )));
    }

    #[test]
    fn test_build_comb_hero_query_exclude_hero_ids() {
        let exclude_hero_ids = vec![1, 2, 3];
        let comb_query = HeroCombStatsQuery {
            exclude_hero_ids: exclude_hero_ids.clone().into(),
            ..Default::default()
        };
        let query = build_comb_hero_query(&comb_query);
        assert!(query.contains(&format!(
                            "not hasAny(hero_ids, [{}])",
                            exclude_hero_ids.iter()
                                .map(|id| id.to_string())
                                .collect::<Vec<_>>()
                                .join(", ")
                        )));
    }

    #[test]
    fn test_build_comb_hero_query_min_matches() {
        let min_matches = Some(1);
        let comb_query = HeroCombStatsQuery {
            min_matches,
            ..Default::default()
        };
        let query = build_comb_hero_query(&comb_query);
        assert!(query.contains("matches >= 1"));
    }
}
