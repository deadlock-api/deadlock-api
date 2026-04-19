#![allow(clippy::struct_excessive_bools)]
#![allow(clippy::large_stack_arrays)]

use core::fmt::Write;
use core::time::Duration;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::query::BytesCursor;
use itertools::Itertools;
use serde::Deserialize;
use strum::Display;
use tokio::io::Lines;
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::{GameMode, MatchMode};
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::utils::parse::{comma_separated_deserialize_option, default_true};
use crate::utils::types::SortDirectionAsc;

fn default_limit() -> u32 {
    1000
}

#[derive(Debug, Clone, Copy, Deserialize, ToSchema, Default, Display)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub(super) enum SortKey {
    #[default]
    MatchId,
    StartTime,
    AverageBadge,
}

#[derive(Debug, Clone, Deserialize, IntoParams, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(super) struct BulkMatchMetadataQuery {
    // Parameters that influence what data is included in the response (SELECT)
    /// Include match info in the response.
    #[serde(default = "default_true")]
    #[param(inline, default = "true")]
    include_info: bool,
    /// Include more match info in the response.
    #[serde(default)]
    include_more_info: bool,
    /// Include objectives in the response.
    #[serde(default)]
    include_objectives: bool,
    /// Include midboss in the response.
    #[serde(default)]
    include_mid_boss: bool,
    /// Include player info in the response.
    #[serde(default)]
    include_player_info: bool,
    /// Include only K/D/A fields (`kills`, `deaths`, `assists`) for players.
    #[serde(default)]
    include_player_kda: bool,
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
    /// Filter matches based on their game mode. Valid values: `normal`, `street_brawl`. **Default:** `normal`.
    #[serde(default = "GameMode::default_option")]
    #[param(inline, default = "normal")]
    game_mode: Option<GameMode>,
    /// Filter matches based on the match mode. Valid values: `unranked`, `private_lobby`, `coop_bot`, `ranked`, `server_test`, `tutorial`, `hero_labs`. **Default:** `ranked,unranked`.
    #[param(value_type = Option<String>)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(
            strategy = "proptest::option::of(proptest::collection::vec(proptest::prelude::any::<crate::routes::v1::matches::types::MatchMode>(), 0..=4))"
        )
    )]
    match_mode: Option<Vec<MatchMode>>,
    /// Comma separated list of match ids, limited by `limit`
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(
            strategy = "proptest::option::of(proptest::collection::vec(proptest::prelude::any::<u64>(), 0..=4))"
        )
    )]
    match_ids: Option<Vec<u64>>,
    /// Filter matches based on their start time (Unix timestamp).
    min_unix_timestamp: Option<i64>,
    /// Filter matches based on their start time (Unix timestamp).
    max_unix_timestamp: Option<i64>,
    /// Filter matches based on their duration in seconds (up to 7000s).
    #[param(maximum = 7000)]
    min_duration_s: Option<u64>,
    /// Filter matches based on their duration in seconds (up to 7000s).
    #[param(maximum = 7000)]
    max_duration_s: Option<u64>,
    /// Filter matches based on the average badge level (tier = first digits, subtier = last digit) of *both* teams involved. See more: <https://assets.deadlock-api.com/v2/ranks>
    #[param(minimum = 0, maximum = 116)]
    min_average_badge: Option<u8>,
    /// Filter matches based on the average badge level (tier = first digits, subtier = last digit) of *both* teams involved. See more: <https://assets.deadlock-api.com/v2/ranks>
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
    #[serde(deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    account_ids: Option<Vec<u32>>,
    /// Filter matches based on the hero IDs. See more: <https://assets.deadlock-api.com/v2/heroes>
    #[param(value_type = Option<String>)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    hero_ids: Option<Vec<u32>>,
    /// Hero ID to scope item filters to. Required when using `include_item_ids` or `exclude_item_ids`.
    item_filter_hero_id: Option<u32>,
    /// Comma separated list of item ids to include.
    /// Requires `item_filter_hero_id`. Returns matches where a player on the specified hero has ALL of these items.
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[param(value_type = Option<String>)]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    include_item_ids: Option<Vec<u32>>,
    /// Comma separated list of item ids to exclude.
    /// Requires `item_filter_hero_id`. Returns matches where a player on the specified hero has NONE of these items.
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    #[param(value_type = Option<String>)]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    exclude_item_ids: Option<Vec<u32>>,
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

#[allow(clippy::too_many_lines)]
fn build_query(query: BulkMatchMetadataQuery) -> APIResult<String> {
    if (query.include_item_ids.is_some() || query.exclude_item_ids.is_some())
        && query.item_filter_hero_id.is_none()
    {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "item_filter_hero_id is required when using include_item_ids or exclude_item_ids",
        ));
    }

    let mut select_fields: Vec<String> = vec![];
    if query.include_info {
        select_fields.extend(vec![
            "any(start_time) as start_time".to_owned(),
            "any(winning_team) as winning_team".to_owned(),
            "any(duration_s) as duration_s".to_owned(),
            "any(match_outcome) as match_outcome".to_owned(),
            "any(match_mode) as match_mode".to_owned(),
            "any(game_mode) as game_mode".to_owned(),
            "any(average_badge_team0) as average_badge_team0".to_owned(),
            "any(average_badge_team1) as average_badge_team1".to_owned(),
            "any(not_scored) as not_scored".to_owned(),
        ]);
    }
    if query.include_more_info {
        select_fields.extend(vec![
            "any(rewards_eligible) as rewards_eligible".to_owned(),
            "any(is_high_skill_range_parties) as is_high_skill_range_parties".to_owned(),
            "any(low_pri_pool) as low_pri_pool".to_owned(),
            "any(new_player_pool) as new_player_pool".to_owned(),
            "any(team_score) as team_score".to_owned(),
            "any(match_tracked_stats) as match_tracked_stats".to_owned(),
            "any(team0_tracked_stats) as team0_tracked_stats".to_owned(),
            "any(team1_tracked_stats) as team1_tracked_stats".to_owned(),
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
        || query.include_player_kda
        || query.include_player_items
        || query.include_player_stats
        || query.include_player_death_details;
    if has_player_fields {
        let mut player_select_fields = vec![
            "match_player.account_id as account_id",
            "hero_id",
            "player_slot",
            "team",
            "dp.hero_build_id as hero_build_id",
        ];
        if query.include_player_info || query.include_player_kda {
            player_select_fields.extend(vec!["kills", "deaths", "assists"]);
        }
        if query.include_player_info {
            player_select_fields.extend(vec![
                "net_worth",
                "last_hits",
                "denies",
                "ability_points",
                "assigned_lane",
                "player_level",
                "abandon_match_time_s",
                "mvp_rank",
                "player_tracked_stats",
                "accolades",
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
            "groupUniqArray(12)(tuple({})::JSON) as players",
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
    info_filters.push(MatchMode::sql_filter(query.match_mode.as_deref()));
    info_filters.push(GameMode::sql_filter(query.game_mode));
    if let Some(min_unix_timestamp) = query.min_unix_timestamp {
        info_filters.push(format!("start_time >= {min_unix_timestamp}"));
    }
    if let Some(max_unix_timestamp) = query.max_unix_timestamp {
        info_filters.push(format!("start_time <= {max_unix_timestamp}"));
    }
    if let Some(min_match_id) = query.min_match_id
        && min_match_id > 0
    {
        info_filters.push(format!("match_id >= {min_match_id}"));
    }
    if let Some(max_match_id) = query.max_match_id {
        info_filters.push(format!("match_id <= {max_match_id}"));
    }
    if let Some(match_ids) = query.match_ids
        && !match_ids.is_empty()
    {
        info_filters.push(format!(
            "match_id IN ({})",
            match_ids.iter().map(ToString::to_string).join(",")
        ));
    }
    if let Some(min_duration_s) = query.min_duration_s
        && min_duration_s > 0
    {
        info_filters.push(format!("duration_s >= {min_duration_s}"));
    }
    if let Some(max_duration_s) = query.max_duration_s {
        info_filters.push(format!("duration_s <= {max_duration_s}"));
    }
    if let Some(min_badge_level) = query.min_average_badge
        && min_badge_level > 11
    {
        info_filters.push(format!("average_badge_team0 >= {min_badge_level}"));
        info_filters.push(format!("average_badge_team1 >= {min_badge_level}"));
    }
    if let Some(max_badge_level) = query.max_average_badge
        && max_badge_level < 116
    {
        info_filters.push(format!("average_badge_team0 <= {max_badge_level}"));
        info_filters.push(format!("average_badge_team1 <= {max_badge_level}"));
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
    if let Some(account_ids) = query.account_ids
        && !account_ids.is_empty()
    {
        player_filters.push(format!(
            "account_id IN ({})",
            account_ids.iter().map(ToString::to_string).join(",")
        ));
    }
    if let Some(hero_ids) = query.hero_ids
        && !hero_ids.is_empty()
    {
        player_filters.push(format!(
            "hero_id IN ({})",
            hero_ids.iter().map(ToString::to_string).join(",")
        ));
    }

    if let Some(item_filter_hero_id) = query.item_filter_hero_id {
        player_filters.push(format!("hero_id = {item_filter_hero_id}"));
    }
    let mut advanced_player_filters = false;
    if let Some(include_item_ids) = &query.include_item_ids
        && !include_item_ids.is_empty()
    {
        player_filters.push(format!(
            "hasAll(items.item_id, [{}])",
            include_item_ids.iter().map(u32::to_string).join(", ")
        ));
        advanced_player_filters = true;
    }
    if let Some(exclude_item_ids) = &query.exclude_item_ids
        && !exclude_item_ids.is_empty()
    {
        player_filters.push(format!(
            "NOT hasAny(items.item_id, [{}])",
            exclude_item_ids.iter().map(u32::to_string).join(", ")
        ));
        advanced_player_filters = true;
    }

    // Add player filter subquery if any player filters exist
    if !player_filters.is_empty() {
        if advanced_player_filters {
            info_filters.push(format!(
                "match_id IN (SELECT match_id FROM match_player WHERE {})",
                player_filters.join(" AND ")
            ));
        } else {
            info_filters.push(format!(
                "match_id IN (SELECT match_id FROM player_match_history WHERE {})",
                player_filters.join(" AND ")
            ));
        }
    }

    let info_filters = if info_filters.is_empty() {
        String::new()
    } else {
        format!(" WHERE {} ", info_filters.join(" AND "))
    };
    let order_by_expr = match query.order_by {
        SortKey::AverageBadge => {
            "(coalesce(average_badge_team0, 0) + coalesce(average_badge_team1, 0)) / 2".to_owned()
        }
        other => other.to_string(),
    };
    let order = format!(" ORDER BY {} {} ", order_by_expr, query.order_direction);
    // For the outer query, match_id needs table qualification to avoid ambiguity
    let outer_order = if matches!(query.order_by, SortKey::MatchId) {
        if has_player_fields {
            format!(" ORDER BY match_player.match_id {} ", query.order_direction)
        } else {
            format!(" ORDER BY match_info.match_id {} ", query.order_direction)
        }
    } else {
        order.clone()
    };
    let limit = format!(" LIMIT {} ", query.limit);

    let mut query = String::new();
    // WITH
    query.push_str("WITH ");
    write!(
        &mut query,
        "t_matches AS (SELECT match_id FROM match_info FINAL {info_filters} {order} {limit})"
    )?;

    select_fields.push("any(dp.banned_hero_ids) as banned_hero_ids".to_owned());

    // SELECT
    query.push_str("SELECT ");
    if has_player_fields {
        query.push_str("match_player.match_id as match_id");
    } else {
        query.push_str("match_info.match_id as match_id");
    }
    if !select_fields.is_empty() {
        query.push_str(", ");
        query.push_str(&select_fields.join(", "));
    }
    if has_player_fields {
        query.push_str(
            " FROM match_player \
             INNER JOIN match_info ON match_player.match_id = match_info.match_id \
             LEFT JOIN demo_player AS dp ON match_player.match_id = dp.match_id AND match_player.account_id = dp.account_id \
             WHERE match_player.match_id IN t_matches",
        );
    } else {
        query.push_str(
            " FROM match_info \
             LEFT JOIN demo_player AS dp ON match_info.match_id = dp.match_id \
             WHERE match_info.match_id IN t_matches ",
        );
    }
    // GROUP By
    if has_player_fields {
        query.push_str(" GROUP BY match_player.match_id ");
    } else {
        query.push_str(" GROUP BY match_info.match_id ");
    }
    // Order By
    query.push_str(&outer_order);
    // Limit
    query.push_str(&limit);
    debug!(?query);
    Ok(query)
}

fn fetch_lines(
    ch_client: &clickhouse::Client,
    query: &str,
) -> clickhouse::error::Result<Lines<BytesCursor>> {
    ch_client
        .query(query)
        .fetch_bytes("JSONEachRow")
        .map(tokio::io::AsyncBufReadExt::lines)
}

async fn parse_lines(mut lines: Lines<BytesCursor>) -> APIResult<Vec<serde_json::Value>> {
    let mut parsed_result: Vec<serde_json::Value> = vec![];
    while let Some(line) = lines.next_line().await? {
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
    description = "
This endpoints lets you fetch multiple match metadata at once. The response is a JSON array of match metadata.

When player info is included, each player object contains a `hero_build_id` field (if available) from demo analysis.

> **Note:** The `hero_build_id` represents the first build the player had selected when the game started. It does not reflect any build changes made during the match.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 10req/min |
| Key | 10req/10s |
| Global | 100req/min |
    "
)]
pub(super) async fn bulk_metadata(
    Query(mut query): Query<BulkMatchMetadataQuery>,
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if query.game_mode.is_some_and(|g| g == GameMode::StreetBrawl)
        && (query.min_average_badge.is_some() || query.max_average_badge.is_some())
    {
        return Err(APIError::StatusMsg {
            status: StatusCode::BAD_REQUEST,
            message: "Cannot filter by average badge for street brawl game mode".to_string(),
        });
    }
    if let Some(account_ids) = query.account_ids {
        let protected_users = state
            .steam_client
            .get_protected_users(&state.pg_client)
            .await?;
        let filtered_account_ids = account_ids
            .into_iter()
            .filter(|id| !protected_users.contains(id))
            .collect::<Vec<_>>();
        if filtered_account_ids.is_empty() {
            return Err(APIError::protected_user());
        }
        query.account_ids = Some(filtered_account_ids);
    }
    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "match_metadata_bulk",
            &[
                Quota::ip_limit(10, Duration::from_mins(1)),
                Quota::key_limit(10, Duration::from_secs(10)),
                Quota::global_limit(100, Duration::from_mins(1)),
            ],
        )
        .await?;
    if query.limit == 0 || query.limit > 10000 {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "limit must be between 1 and 10000".to_owned(),
        ));
    }
    debug!(?query);
    let query = build_query(query)?;
    let lines = fetch_lines(&state.ch_client_ro, &query)?;
    let parsed_result = parse_lines(lines).await?;
    if parsed_result.is_empty() {
        return Err(APIError::status_msg(
            StatusCode::NOT_FOUND,
            "No matches found".to_owned(),
        ));
    }
    Ok(Json(parsed_result))
}

#[cfg(test)]
mod proptests {
    use proptest::prelude::*;

    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    proptest! {
        #![proptest_config(ProptestConfig { cases: 32, max_shrink_iters: 16, failure_persistence: None, .. ProptestConfig::default() })]

        #[test]
        fn bulk_metadata_build_query_is_valid_sql(query: BulkMatchMetadataQuery) {
            // build_query returns Err for invalid param combos (e.g. item filter
            // without hero id); those aren't SQL bugs — only validate the Ok path.
            if let Ok(sql) = build_query(query) {
                assert_valid_sql(&sql);
            }
        }
    }
}
