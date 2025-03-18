use crate::error::{APIError, APIResult};
use crate::state::AppState;
use crate::utils::limiter::{RateLimitQuota, apply_limits};
use crate::utils::parse::comma_seperated_num_deserialize;
use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::query::BytesCursor;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use strum_macros::IntoStaticStr;
use tokio::io::{AsyncBufReadExt, Lines};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

fn true_default() -> bool {
    true
}

fn default_limit() -> u32 {
    1000
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, Default, IntoStaticStr)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum SortDirection {
    #[default]
    Desc,
    Asc,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, Default, IntoStaticStr)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum SortKey {
    #[default]
    MatchId,
    StartTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, IntoParams)]
pub struct BulkMatchMetadataQuery {
    // Parameters that influence what data is included in the response (SELECT)
    #[serde(default = "true_default")]
    #[param(inline, default = "true")]
    include_info: bool,
    #[serde(default)]
    include_damage_matrix: bool,
    #[serde(default)]
    include_objectives: bool,
    #[serde(default)]
    include_mid_boss: bool,
    #[serde(default)]
    include_player_info: bool,
    #[serde(default)]
    include_player_items: bool,
    #[serde(default)]
    include_player_stats: bool,
    #[serde(default)]
    include_player_death_details: bool,
    // Parameters that influence what data is included in the response (WHERE)
    min_unix_timestamp: Option<u64>,
    max_unix_timestamp: Option<u64>,
    #[param(minimum = 0)]
    min_match_id: Option<u64>,
    #[param(minimum = 0)]
    max_match_id: Option<u64>,
    /// Comma separated list of match ids, limited by `limit`
    #[serde(deserialize_with = "comma_seperated_num_deserialize")]
    match_ids: Option<Vec<u64>>,
    #[param(minimum = 0, maximum = 7000)]
    min_duration_s: Option<u64>,
    #[param(minimum = 0, maximum = 7000)]
    max_duration_s: Option<u64>,
    #[param(minimum = 0, maximum = 116)]
    min_average_badge: Option<u8>,
    #[param(minimum = 0, maximum = 116)]
    max_average_badge: Option<u8>,
    is_high_skill_range_parties: Option<bool>,
    is_low_pri_pool: Option<bool>,
    is_new_player_pool: Option<bool>,
    // Parameters that influence the ordering of the response (ORDER BY)
    #[serde(default)]
    #[param(inline, default = "SortKey::MatchId")]
    order_by: SortKey,
    #[serde(default)]
    #[param(inline, default = "SortDirection::Desc")]
    order_direction: SortDirection,
    #[serde(default = "default_limit")]
    #[param(minimum = 1, maximum = 10000, default = 1000)]
    limit: u32,
}

#[utoipa::path(
    get,
    path = "/metadata",
    params(BulkMatchMetadataQuery),
    responses(
        (status = OK, body = [u8]),
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
        &[RateLimitQuota::ip_limit(60, Duration::from_secs(60))],
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
    let lines = fetch_lines(&state.clickhouse_client, &query)
        .await
        .map_err(|_| APIError::InternalError {
            message: "Failed to fetch match metadata".to_string(),
        })?;
    let parsed_result = parse_lines(lines)
        .await
        .map_err(|_| APIError::InternalError {
            message: "Failed to parse match metadata".to_string(),
        })?;
    Ok(Json(parsed_result))
}

fn build_ch_query(settings: BulkMatchMetadataQuery) -> APIResult<String> {
    let mut select_fields: Vec<String> = vec![];
    if settings.include_info {
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
    if settings.include_damage_matrix {
        select_fields
            .push("(any(sample_time_s) as sample_time_s, any(stat_type) as stat_type, any(source_name) as source_name)::JSON as damage_matrix".to_owned());
    }
    if settings.include_mid_boss {
        select_fields.push("any(mid_boss) as mid_boss".to_owned());
    }
    if settings.include_objectives {
        select_fields.push("any(objectives) as objectives".to_owned());
    }
    // Player Select Fields
    let has_player_fields = settings.include_player_info
        || settings.include_player_items
        || settings.include_player_stats
        || settings.include_player_death_details;
    if has_player_fields {
        let mut player_select_fields = vec!["account_id", "hero_id", "player_slot", "team"];
        if settings.include_player_info {
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
        if settings.include_player_items {
            player_select_fields.push("items");
        }
        if settings.include_player_stats {
            player_select_fields.push("stats");
        }
        if settings.include_player_death_details {
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

    let mut info_where_clauses = vec![];
    if let Some(min_unix_timestamp) = settings.min_unix_timestamp {
        info_where_clauses.push(format!("start_time >= {}", min_unix_timestamp));
    }
    if let Some(max_unix_timestamp) = settings.max_unix_timestamp {
        info_where_clauses.push(format!("start_time <= {}", max_unix_timestamp));
    }
    if let Some(min_match_id) = settings.min_match_id {
        info_where_clauses.push(format!("match_id >= {}", min_match_id));
    }
    if let Some(max_match_id) = settings.max_match_id {
        info_where_clauses.push(format!("match_id <= {}", max_match_id));
    }
    if let Some(match_ids) = settings.match_ids {
        if !match_ids.is_empty() {
            info_where_clauses.push(format!(
                "match_id IN ({})",
                match_ids.iter().map(|m| m.to_string()).join(",")
            ));
        }
    }
    if let Some(min_duration_s) = settings.min_duration_s {
        info_where_clauses.push(format!("duration_s >= {}", min_duration_s));
    }
    if let Some(max_duration_s) = settings.max_duration_s {
        info_where_clauses.push(format!("duration_s <= {}", max_duration_s));
    }
    if let Some(min_average_badge) = settings.min_average_badge {
        info_where_clauses.push(format!("average_badge_team0 >= {}", min_average_badge));
        info_where_clauses.push(format!("average_badge_team1 >= {}", min_average_badge));
    }
    if let Some(max_average_badge) = settings.max_average_badge {
        info_where_clauses.push(format!("average_badge_team0 <= {}", max_average_badge));
        info_where_clauses.push(format!("average_badge_team1 <= {}", max_average_badge));
    }
    if let Some(is_high_skill_range_parties) = settings.is_high_skill_range_parties {
        info_where_clauses.push(format!(
            "is_high_skill_range_parties = {}",
            is_high_skill_range_parties
        ));
    }
    if let Some(is_low_pri_pool) = settings.is_low_pri_pool {
        info_where_clauses.push(format!("low_pri_pool = {}", is_low_pri_pool));
    }
    if let Some(is_new_player_pool) = settings.is_new_player_pool {
        info_where_clauses.push(format!("new_player_pool = {}", is_new_player_pool));
    }

    let info_where = if !info_where_clauses.is_empty() {
        format!(" WHERE {} ", info_where_clauses.join(" AND "))
    } else {
        "".to_owned()
    };
    let order_by: &str = settings.order_by.into();
    let order_direction: &str = settings.order_direction.into();
    let order = format!(" ORDER BY {} {} ", order_by, order_direction);
    let limit = format!(" LIMIT {} ", settings.limit);

    let mut query = String::new();
    // WITH
    query.push_str("WITH ");
    query.push_str(&format!(
        "t_matches AS (SELECT * FROM match_info FINAL {} {} {})",
        info_where, order, limit
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
    debug!(query = %query);
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
