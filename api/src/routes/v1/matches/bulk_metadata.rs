use crate::error::{APIError, APIResult};
use crate::state::AppState;
use crate::utils::limiter::{RateLimitQuota, apply_limits};
use crate::utils::parse::{comma_separated_num_deserialize, default_true};
use crate::utils::types::SortDirectionAsc;
use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::query::BytesCursor;
use itertools::Itertools;
use serde::Deserialize;
use std::time::Duration;
use strum_macros::IntoStaticStr;
use tokio::io::{AsyncBufReadExt, Lines};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

fn default_limit() -> u32 {
    1000
}

#[derive(Debug, Clone, Deserialize, ToSchema, Default, IntoStaticStr)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum SortKey {
    #[default]
    MatchId,
    StartTime,
}

#[derive(Debug, Clone, Deserialize, IntoParams)]
pub struct BulkMatchMetadataQuery {
    // Parameters that influence what data is included in the response (SELECT)
    /// Include match info in the response.
    #[serde(default = "default_true")]
    #[param(inline, default = "true")]
    pub include_info: bool,
    /// Include damage matrix in the response.
    #[serde(default)]
    pub include_damage_matrix: bool,
    /// Include objectives in the response.
    #[serde(default)]
    pub include_objectives: bool,
    /// Include midboss in the response.
    #[serde(default)]
    pub include_mid_boss: bool,
    /// Include player info in the response.
    #[serde(default)]
    pub include_player_info: bool,
    /// Include player items in the response.
    #[serde(default)]
    pub include_player_items: bool,
    /// Include player stats in the response.
    #[serde(default)]
    pub include_player_stats: bool,
    /// Include player death details in the response.
    #[serde(default)]
    pub include_player_death_details: bool,
    // Parameters that influence what data is included in the response (WHERE)
    /// Comma separated list of match ids, limited by `limit`
    #[serde(default)]
    #[serde(deserialize_with = "comma_separated_num_deserialize")]
    pub match_ids: Option<Vec<u64>>,
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
    /// Filter matches based on whether they are in the high skill range.
    pub is_high_skill_range_parties: Option<bool>,
    /// Filter matches based on whether they are in the low priority pool.
    pub is_low_pri_pool: Option<bool>,
    /// Filter matches based on whether they are in the new player pool.
    pub is_new_player_pool: Option<bool>,
    // Parameters that influence the ordering of the response (ORDER BY)
    /// The field to order the results by.
    #[serde(default)]
    #[param(inline)]
    pub order_by: SortKey,
    /// The direction to order the results by.
    #[serde(default)]
    #[param(inline)]
    pub order_direction: SortDirectionAsc,
    /// The maximum number of matches to return.
    #[serde(default = "default_limit")]
    #[param(minimum = 1, maximum = 10000, default = 1000)]
    pub limit: u32,
}

#[utoipa::path(
    get,
    path = "/metadata",
    params(BulkMatchMetadataQuery),
    responses(
        (status = OK, body = [u8]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
    ),
    tags = ["Matches"],
    summary = "Bulk Match Metadata",
    description = r#"
> ⚠ **IN DEVELOPMENT**

This endpoints lets you fetch multiple match metadata at once. The response is a JSON array of match metadata.
    "#
)]
pub async fn bulk_metadata(
    Query(query): Query<BulkMatchMetadataQuery>,
    headers: HeaderMap,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    apply_limits(
        &headers,
        &state,
        "match_metadata_bulk",
        &[RateLimitQuota::ip_limit(10, Duration::from_secs(1))],
    )
    .await?;
    if query.limit > 10000 {
        return Err(APIError::StatusMsg {
            status: StatusCode::BAD_REQUEST,
            message: "Limit is too high".to_string(),
        });
    }
    debug!(?query);
    let query = build_ch_query(query)?;
    let lines =
        fetch_lines(&state.ch_client, &query)
            .await
            .map_err(|_| APIError::InternalError {
                message: "Failed to fetch match metadata".to_string(),
            })?;
    let parsed_result = parse_lines(lines)
        .await
        .map_err(|_| APIError::InternalError {
            message: "Failed to parse match metadata".to_string(),
        })?;
    if parsed_result.is_empty() {
        return Err(APIError::StatusMsg {
            status: StatusCode::NOT_FOUND,
            message: "No matches found".to_string(),
        });
    }
    Ok(Json(parsed_result))
}

fn build_ch_query(query: BulkMatchMetadataQuery) -> APIResult<String> {
    let mut select_fields: Vec<String> = vec![];
    if query.include_info {
        select_fields.extend(vec![
            "match_id".to_owned(),
            "any(start_time) as start_time".to_owned(),
            "any(winning_team) as winning_team".to_owned(),
            "any(duration_s) as duration_s".to_owned(),
            "any(match_outcome) as match_outcome".to_owned(),
            "any(match_mode) as match_mode".to_owned(),
            "any(game_mode) as game_mode".to_owned(),
            "any(is_high_skill_range_parties) as is_high_skill_range_parties".to_owned(),
            "any(low_pri_pool) as low_pri_pool".to_owned(),
            "any(new_player_pool) as new_player_pool".to_owned(),
            "any(average_badge_team0) as average_badge_team0".to_owned(),
            "any(average_badge_team1) as average_badge_team1".to_owned(),
            "any(game_mode_version) as game_mode_version".to_owned(),
        ]);
    }
    if query.include_damage_matrix {
        select_fields
            .push("(any(sample_time_s) as sample_time_s, any(stat_type) as stat_type, any(source_name) as source_name)::JSON as damage_matrix".to_owned());
    }
    if query.include_mid_boss {
        select_fields.push("any(mid_boss) as mid_boss".to_owned());
    }
    if query.include_objectives {
        select_fields.push("any(objectives) as objectives".to_owned());
    }
    // Player Select Fields
    let has_player_fields = query.include_player_info
        || query.include_player_items
        || query.include_player_stats
        || query.include_player_death_details;
    if has_player_fields {
        let mut player_select_fields = vec!["account_id", "hero_id", "player_slot", "team"];
        if query.include_player_info {
            player_select_fields.extend(vec![
                "kills",
                "deaths",
                "assists",
                "net_worth",
                "last_hits",
                "denies",
                "ability_points",
                "party",
                "assigned_lane",
                "player_level",
                "abandon_match_time_s",
            ]);
        }
        if query.include_player_items {
            player_select_fields.push("items");
        }
        if query.include_player_stats {
            player_select_fields.push("stats");
        }
        if query.include_player_death_details {
            player_select_fields.push("death_details");
        }
        let player_select_fields = format!(
            "groupUniqArray(12)(({})::JSON) as players",
            player_select_fields.join(", ")
        );
        select_fields.push(player_select_fields);
    }

    if select_fields.is_empty() {
        return Err(APIError::StatusMsg {
            status: StatusCode::BAD_REQUEST,
            message: "No fields selected".to_string(),
        });
    }

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
    if let Some(match_ids) = query.match_ids {
        if !match_ids.is_empty() {
            info_filters.push(format!(
                "match_id IN ({})",
                match_ids.iter().map(|m| m.to_string()).join(",")
            ));
        }
    }
    if let Some(min_duration_s) = query.min_duration_s {
        info_filters.push(format!("duration_s >= {min_duration_s}"));
    }
    if let Some(max_duration_s) = query.max_duration_s {
        info_filters.push(format!("duration_s <= {max_duration_s}"));
    }
    if let Some(min_average_badge) = query.min_average_badge {
        info_filters.push(format!("average_badge_team0 >= {min_average_badge}"));
        info_filters.push(format!("average_badge_team1 >= {min_average_badge}"));
    }
    if let Some(max_average_badge) = query.max_average_badge {
        info_filters.push(format!("average_badge_team0 <= {max_average_badge}"));
        info_filters.push(format!("average_badge_team1 <= {max_average_badge}"));
    }
    if let Some(is_high_skill_range_parties) = query.is_high_skill_range_parties {
        info_filters.push(format!(
            "is_high_skill_range_parties = {is_high_skill_range_parties}"
        ));
    }
    if let Some(is_low_pri_pool) = query.is_low_pri_pool {
        info_filters.push(format!("low_pri_pool = {is_low_pri_pool}"));
    }
    if let Some(is_new_player_pool) = query.is_new_player_pool {
        info_filters.push(format!("new_player_pool = {is_new_player_pool}"));
    }

    let info_filters = if !info_filters.is_empty() {
        format!(" WHERE {} ", info_filters.join(" AND "))
    } else {
        "".to_owned()
    };
    let order_by: &str = query.order_by.into();
    let order = format!(" ORDER BY {} {} ", order_by, query.order_direction);
    let limit = format!(" LIMIT {} ", query.limit);

    let mut query = String::new();
    // WITH
    query.push_str("WITH ");
    query.push_str(&format!(
        "t_matches AS (SELECT * FROM match_info FINAL {info_filters} {order} {limit})"
    ));
    if has_player_fields {
        query.push_str(
            ", t_players AS (SELECT * FROM match_player FINAL WHERE match_id IN (SELECT match_id FROM t_matches))",
        );
    }

    // SELECT
    query.push_str("SELECT ");
    query.push_str(&select_fields.join(", "));
    if has_player_fields {
        query.push_str(" FROM t_players INNER JOIN t_matches USING (match_id) ");
    } else {
        query.push_str(" FROM t_matches ");
    }
    // GROUP By
    query.push_str(" GROUP BY match_id ");
    // Order By
    query.push_str(&order);
    // Limit
    query.push_str(&limit);
    debug!(?query);
    Ok(query)
}

async fn fetch_lines(
    ch_client: &clickhouse::Client,
    query: &str,
) -> clickhouse::error::Result<Lines<BytesCursor>> {
    ch_client
        .query(query)
        .fetch_bytes("JSONEachRow")
        .map(|m| m.lines())
}

async fn parse_lines(mut lines: Lines<BytesCursor>) -> serde_json::Result<Vec<serde_json::Value>> {
    let mut parsed_result: Vec<serde_json::Value> = vec![];
    while let Ok(Some(line)) = lines.next_line().await {
        let value: serde_json::Value = serde_json::de::from_str(&line)?;
        parsed_result.push(value);
    }
    Ok(parsed_result)
}
