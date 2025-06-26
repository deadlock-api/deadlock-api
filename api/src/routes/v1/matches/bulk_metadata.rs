use crate::error::{APIError, APIResult};
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;

use crate::context::AppState;
use crate::utils::parse::{comma_separated_num_deserialize_option, default_true};
use crate::utils::types::SortDirectionAsc;
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::query::BytesCursor;
use itertools::Itertools;
use serde::Deserialize;
use std::time::Duration;
use strum_macros::Display;
use tokio::io::{AsyncBufReadExt, Lines};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

fn default_limit() -> u32 {
    1000
}

#[derive(Debug, Clone, Deserialize, ToSchema, Default, Display)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
enum SortKey {
    #[default]
    MatchId,
    StartTime,
}

#[derive(Debug, Clone, Deserialize, IntoParams, Default)]
pub(super) struct BulkMatchMetadataQuery {
    // Parameters that influence what data is included in the response (SELECT)
    /// Include match info in the response.
    #[serde(default = "default_true")]
    #[param(inline, default = "true")]
    include_info: bool,
    /// Include objectives in the response.
    #[serde(default)]
    include_objectives: bool,
    /// Include midboss in the response.
    #[serde(default)]
    include_mid_boss: bool,
    /// Include player info in the response.
    #[serde(default)]
    include_player_info: bool,
    /// Include player items in the response.
    #[serde(default)]
    include_player_items: bool,
    /// Include player stats in the response.
    #[serde(default)]
    include_player_stats: bool,
    /// Include player death details in the response.
    #[serde(default)]
    include_player_death_details: bool,
    // Parameters that influence what data is included in the response (WHERE)
    /// Comma separated list of match ids, limited by `limit`
    #[serde(default)]
    #[serde(deserialize_with = "comma_separated_num_deserialize_option")]
    match_ids: Option<Vec<u64>>,
    /// Filter matches based on their start time (Unix timestamp).
    min_unix_timestamp: Option<u64>,
    /// Filter matches based on their start time (Unix timestamp).
    max_unix_timestamp: Option<u64>,
    /// Filter matches based on their duration in seconds (up to 7000s).
    #[param(maximum = 7000)]
    min_duration_s: Option<u64>,
    /// Filter matches based on their duration in seconds (up to 7000s).
    #[param(maximum = 7000)]
    max_duration_s: Option<u64>,
    /// Filter matches based on the average badge level (0-116) of *both* teams involved. See more: https://assets.deadlock-api.com/v2/ranks
    #[param(minimum = 0, maximum = 116)]
    min_average_badge: Option<u8>,
    /// Filter matches based on the average badge level (0-116) of *both* teams involved. See more: https://assets.deadlock-api.com/v2/ranks
    #[param(minimum = 0, maximum = 116)]
    max_average_badge: Option<u8>,
    /// Filter matches based on their ID.
    min_match_id: Option<u64>,
    /// Filter matches based on their ID.
    max_match_id: Option<u64>,
    /// Filter matches based on whether they are in the high skill range.
    is_high_skill_range_parties: Option<bool>,
    /// Filter matches based on whether they are in the low priority pool.
    is_low_pri_pool: Option<bool>,
    /// Filter matches based on whether they are in the new player pool.
    is_new_player_pool: Option<bool>,
    /// Filter matches by account IDs of players that participated in the match.
    #[serde(default)]
    #[serde(deserialize_with = "comma_separated_num_deserialize_option")]
    account_ids: Option<Vec<u32>>,
    // Parameters that influence the ordering of the response (ORDER BY)
    /// The field to order the results by.
    #[serde(default)]
    #[param(inline)]
    order_by: SortKey,
    /// The direction to order the results by.
    #[serde(default)]
    #[param(inline)]
    order_direction: SortDirectionAsc,
    /// The maximum number of matches to return.
    #[serde(default = "default_limit")]
    #[param(minimum = 1, maximum = 10000, default = 1000)]
    limit: u32,
}

fn build_query(query: BulkMatchMetadataQuery) -> APIResult<String> {
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
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "No fields selected",
        ));
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
                match_ids.iter().map(ToString::to_string).join(",")
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

    // Player filters - conditions that require subqueries on match_player
    let mut player_filters = vec![];
    if let Some(account_ids) = query.account_ids {
        if !account_ids.is_empty() {
            player_filters.push(format!(
                "account_id IN ({})",
                account_ids.iter().map(ToString::to_string).join(",")
            ));
        }
    }

    // Add player filter subquery if any player filters exist
    if !player_filters.is_empty() {
        info_filters.push(format!(
            "match_id IN (SELECT match_id FROM match_player WHERE {})",
            player_filters.join(" AND ")
        ));
    }

    let info_filters = if info_filters.is_empty() {
        String::new()
    } else {
        format!(" WHERE {} ", info_filters.join(" AND "))
    };
    let order = format!(" ORDER BY {} {} ", query.order_by, query.order_direction);
    let limit = format!(" LIMIT {} ", query.limit);

    let mut query = String::new();
    // WITH
    query.push_str("WITH ");
    query.push_str(&format!(
        "t_matches AS (SELECT match_id FROM match_info FINAL {info_filters} {order} {limit})"
    ));

    // SELECT
    query.push_str("SELECT ");
    query.push_str(&select_fields.join(", "));
    if has_player_fields {
        query.push_str(" FROM match_player INNER JOIN match_info USING (match_id) WHERE match_id IN t_matches ");
    } else {
        query.push_str(" FROM match_info WHERE match_id IN t_matches ");
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
        .map(tokio::io::AsyncBufReadExt::lines)
}

async fn parse_lines(mut lines: Lines<BytesCursor>) -> serde_json::Result<Vec<serde_json::Value>> {
    let mut parsed_result: Vec<serde_json::Value> = vec![];
    while let Ok(Some(line)) = lines.next_line().await {
        let value: serde_json::Value = serde_json::de::from_str(&line)?;
        parsed_result.push(value);
    }
    Ok(parsed_result)
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
    summary = "Bulk Metadata",
    description = r#"
This endpoints lets you fetch multiple match metadata at once. The response is a JSON array of match metadata.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 1req/s |
| Key | - |
| Global | 10req/s |
    "#
)]
pub(super) async fn bulk_metadata(
    Query(query): Query<BulkMatchMetadataQuery>,
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "match_metadata_bulk",
            &[
                Quota::ip_limit(1, Duration::from_secs(1)),
                Quota::key_limit(10, Duration::from_secs(1)),
            ],
        )
        .await?;
    if query.limit > 10000 {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "limit must be between 1 and 1000".to_string(),
        ));
    }
    debug!(?query);
    let query = build_query(query)?;
    let lines = fetch_lines(&state.ch_client_ro, &query).await?;
    let parsed_result = parse_lines(lines).await?;
    if parsed_result.is_empty() {
        return Err(APIError::status_msg(
            StatusCode::NOT_FOUND,
            "No matches found".to_string(),
        ));
    }
    Ok(Json(parsed_result))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn normalize_whitespace(s: &str) -> String {
        s.replace(['\n', '\t'], " ").split_whitespace().join(" ")
    }

    #[test]
    fn test_build_ch_query_with_account_ids() {
        let query = BulkMatchMetadataQuery {
            include_info: true,
            account_ids: Some(vec![12345, 67890]),
            limit: 10,
            ..Default::default()
        };

        let result = build_query(query).unwrap();
        let normalized = normalize_whitespace(&result);

        // Should contain the player filter subquery
        assert!(normalized.contains(
            "match_id IN (SELECT match_id FROM match_player WHERE account_id IN (12345,67890))"
        ));
        // Should still have the basic structure
        assert!(normalized.contains("t_matches AS (SELECT match_id FROM match_info FINAL"));
        assert!(normalized.contains("WHERE"));
        assert!(normalized.contains("LIMIT 10"));
    }

    #[test]
    fn test_build_ch_query_with_empty_account_ids() {
        let query = BulkMatchMetadataQuery {
            include_info: true,
            account_ids: Some(vec![]),
            limit: 10,
            ..Default::default()
        };

        let result = build_query(query).unwrap();
        let normalized = normalize_whitespace(&result);

        // Should not contain player filter when account_ids is empty
        assert!(!normalized.contains("match_id IN (SELECT match_id FROM match_player"));
    }

    #[test]
    fn test_build_ch_query_without_account_ids() {
        let query = BulkMatchMetadataQuery {
            include_info: true,
            limit: 10,
            ..Default::default()
        };

        let result = build_query(query).unwrap();
        let normalized = normalize_whitespace(&result);

        // Should not contain player filter when account_ids is None
        assert!(!normalized.contains("match_id IN (SELECT match_id FROM match_player"));
    }

    #[test]
    fn test_build_ch_query_account_ids_with_other_filters() {
        let query = BulkMatchMetadataQuery {
            include_info: true,
            account_ids: Some(vec![12345]),
            min_unix_timestamp: Some(1640995200), // 2022-01-01
            max_duration_s: Some(3600),
            limit: 5,
            ..Default::default()
        };

        let result = build_query(query).unwrap();
        let normalized = normalize_whitespace(&result);

        // Should contain all filters
        assert!(normalized.contains(
            "match_id IN (SELECT match_id FROM match_player WHERE account_id IN (12345))"
        ));
        assert!(normalized.contains("start_time >= 1640995200"));
        assert!(normalized.contains("duration_s <= 3600"));
        assert!(normalized.contains("LIMIT 5"));
    }
}
