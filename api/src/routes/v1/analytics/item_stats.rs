use crate::context::AppState;
use crate::error::APIResult;
use crate::utils::parse::{
    comma_separated_num_deserialize_option, default_last_month_timestamp, parse_steam_id_option,
};
use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use derive_more::Display;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

fn default_min_matches() -> Option<u32> {
    20.into()
}

#[derive(Debug, Clone, Copy, Deserialize, ToSchema, Default, Display, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub(super) enum BucketQuery {
    /// No Bucketing
    #[display("no_bucket")]
    #[default]
    NoBucket,
    /// Bucket Item Stats By Start Time (Hour)
    #[display("start_time_hour")]
    StartTimeHour,
    /// Bucket Item Stats By Start Time (Day)
    #[display("start_time_day")]
    StartTimeDay,
    /// Bucket Item Stats by Game Time (Minutes)
    #[display("game_time_min")]
    GameTimeMin,
    /// Bucket Item Stats by Game Time Normalized
    #[display("game_time_normalized_percentage")]
    GameTimeNormalizedPercentage,
    /// Bucket Item Stats by Net Worth (grouped by 1000)
    #[display("net_worth_by_1000")]
    NetWorthBy1000,
    /// Bucket Item Stats by Net Worth (grouped by 2000)
    #[display("net_worth_by_2000")]
    NetWorthBy2000,
    /// Bucket Item Stats by Net Worth (grouped by 3000)
    #[display("net_worth_by_3000")]
    NetWorthBy3000,
    /// Bucket Item Stats by Net Worth (grouped by 5000)
    #[display("net_worth_by_5000")]
    NetWorthBy5000,
    /// Bucket Item Stats by Net Worth (grouped by 10000)
    #[display("net_worth_by_10000")]
    NetWorthBy10000,
}

impl BucketQuery {
    pub(super) fn get_select_clause(&self) -> String {
        match self {
            Self::NoBucket => "NULL".to_string(),
            Self::StartTimeHour => "toNullable(toStartOfHour(start_time))".to_string(),
            Self::StartTimeDay => "toNullable(toStartOfDay(start_time))".to_string(),
            Self::GameTimeMin => "toNullable(toUInt32(floor(buy_time / 60)))".to_string(),
            Self::GameTimeNormalizedPercentage => {
                "toNullable(toUInt32(floor((buy_time - 1) / duration_s * 100)))".to_string()
            }
            Self::NetWorthBy1000 => {
                "toNullable(toUInt32(floor(net_worth_at_buy / 1000)))".to_string()
            }
            Self::NetWorthBy2000 => {
                "toNullable(toUInt32(floor(net_worth_at_buy / 2000)))".to_string()
            }
            Self::NetWorthBy3000 => {
                "toNullable(toUInt32(floor(net_worth_at_buy / 3000)))".to_string()
            }
            Self::NetWorthBy5000 => {
                "toNullable(toUInt32(floor(net_worth_at_buy / 5000)))".to_string()
            }
            Self::NetWorthBy10000 => {
                "toNullable(toUInt32(floor(net_worth_at_buy / 10000)))".to_string()
            }
        }
    }
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
pub(crate) struct ItemStatsQuery {
    /// Filter matches based on the hero ID.
    hero_id: Option<u32>,
    /// Filter matches based on their start time (Unix timestamp). **Default:** 30 days ago.
    #[serde(default = "default_last_month_timestamp")]
    #[param(default = default_last_month_timestamp)]
    min_unix_timestamp: Option<u64>,
    /// Filter matches based on their start time (Unix timestamp).
    max_unix_timestamp: Option<u64>,
    /// Filter matches based on their duration in seconds (up to 7000s).
    #[param(maximum = 7000)]
    min_duration_s: Option<u64>,
    /// Filter matches based on their duration in seconds (up to 7000s).
    #[param(maximum = 7000)]
    max_duration_s: Option<u64>,
    /// Filter matches based on the average badge level (0-116) of *both* teams involved.
    #[param(minimum = 0, maximum = 116)]
    min_average_badge: Option<u8>,
    /// Filter matches based on the average badge level (0-116) of *both* teams involved.
    #[param(minimum = 0, maximum = 116)]
    max_average_badge: Option<u8>,
    /// Filter matches based on their ID.
    min_match_id: Option<u64>,
    /// Filter matches based on their ID.
    max_match_id: Option<u64>,
    /// Comma separated list of item ids to include
    #[serde(default, deserialize_with = "comma_separated_num_deserialize_option")]
    include_item_ids: Option<Vec<u32>>,
    /// Comma separated list of item ids to exclude
    #[serde(default, deserialize_with = "comma_separated_num_deserialize_option")]
    exclude_item_ids: Option<Vec<u32>>,
    /// The minimum number of matches played for an item to be included in the response.
    #[serde(default = "default_min_matches")]
    #[param(minimum = 1, default = 20)]
    min_matches: Option<u32>,
    /// Filter for matches with a specific player account ID.
    #[serde(default, deserialize_with = "parse_steam_id_option")]
    account_id: Option<u32>,
    /// Bucket the stats.
    #[serde(default)]
    #[param(inline)]
    bucket: BucketQuery,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct ItemStats {
    pub item_id: u32,
    pub bucket: Option<u32>,
    pub wins: u64,
    pub losses: u64,
    pub matches: u64,
    players: u64,
}

fn build_item_stats_query(query: &ItemStatsQuery) -> String {
    /* ---------- match_info filters ---------- */
    let mut info_filters = Vec::new();
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

    /* ---------- match_player filters ---------- */
    let mut player_filters = Vec::new();
    if let Some(hero_id) = query.hero_id {
        player_filters.push(format!("hero_id = {hero_id}"));
    }
    if let Some(account_id) = query.account_id {
        player_filters.push(format!("account_id = {account_id}"));
    }
    if let Some(include_item_ids) = &query.include_item_ids {
        player_filters.push(format!(
            "hasAll(items.item_id, [{}])",
            include_item_ids
                .iter()
                .map(u32::to_string)
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }
    if let Some(exclude_item_ids) = &query.exclude_item_ids {
        player_filters.push(format!(
            "NOT hasAny(items.item_id, [{}])",
            exclude_item_ids
                .iter()
                .map(u32::to_string)
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }
    let player_filters = if player_filters.is_empty() {
        // WHERE 1 = 1 makes string concatenation simpler later on.
        "".to_string()
    } else {
        format!(" AND {}", player_filters.join(" AND "))
    };

    /* ---------- misc ---------- */
    let bucket_expr = query.bucket.get_select_clause();
    let min_matches = query
        .min_matches
        .or(default_min_matches())
        .unwrap_or_default();

    /* ---------- final query ---------- */
    format!(
        r#"
WITH
    /* 1. Relevant matches */
    t_matches AS (
        SELECT match_id, start_time, duration_s
        FROM match_info FINAL
        WHERE match_mode IN ('Ranked', 'Unranked'){info_filters}
    ),

    /* 2. Filtered players — *single* scan of `match_player` */
    filtered_players AS (
        SELECT
            match_id,
            account_id,
            items,
            won,
            `stats.time_stamp_s` AS st_ts,   -- stats tick-times
            `stats.net_worth`   AS st_nw    -- net-worth samples
        FROM match_player FINAL
        /* Push the cheapest predicate (match_id) to PREWHERE for I/O pruning */
        PREWHERE match_id IN (SELECT match_id FROM t_matches)
        WHERE 1 = 1{player_filters}
    ),

    /* 3. Explode items only after filtering */
    exploded_players AS (
        SELECT
            match_id,
            account_id,
            it.item_id     AS item_id,
            it.game_time_s AS buy_time,
            won,

            /* first stats tick ≥ buy_time (Int64) */
            arrayFirstIndex(
                ts -> ts >= it.game_time_s,
                st_ts
            )                    AS idx_ge,

            /* net-worth sample just before / at buy_time                          *
             * idx_ge = 0  → purchase after last sample → use last element        *
             * idx_ge = 1  → purchase before first      → use first element (1)   */
            arrayElement(
                st_nw,
                if(idx_ge = 0,
                   toInt64(length(st_nw)),
                   greatest(1, idx_ge - 1)
                )
            )                    AS net_worth_at_buy
        FROM filtered_players
        ARRAY JOIN items AS it
        WHERE
            buy_time > 0
            /* Keep only recognised items */
            AND it.item_id IN (SELECT id FROM items)
    )

/* 4. Aggregation */
SELECT
    item_id,
    {bucket_expr}                   AS bucket,
    SUM(won)                        AS wins,
    SUM(NOT won)                    AS losses,
    wins + losses                   AS matches,
    COUNT(DISTINCT account_id)      AS players
FROM exploded_players
INNER JOIN t_matches USING (match_id)
GROUP BY item_id, bucket
HAVING matches >= {min_matches}
ORDER BY item_id, bucket
        "#
    )
}

#[cached(
    ty = "TimedCache<String, Vec<ItemStats>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = r#"{ format!("{:?}", query) }"#,
    sync_writes = "by_key",
    key = "String"
)]
async fn get_item_stats(
    ch_client: &clickhouse::Client,
    query: ItemStatsQuery,
) -> APIResult<Vec<ItemStats>> {
    let query = build_item_stats_query(&query);
    debug!(?query);
    Ok(ch_client.query(&query).fetch_all().await?)
}

#[utoipa::path(
    get,
    path = "/item-stats",
    params(ItemStatsQuery),
    responses(
        (status = OK, description = "Item Stats", body = [ItemStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch item stats")
    ),
    tags = ["Analytics"],
    summary = "Item Stats",
    description = r#"
Retrieves item statistics based on historical match data.

Results are cached for **1 hour** based on the unique combination of query parameters provided. Subsequent identical requests within this timeframe will receive the cached response.
    "#
)]
pub(crate) async fn item_stats(
    Query(query): Query<ItemStatsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_item_stats(&state.ch_client, query).await.map(Json)
}

#[cfg(test)]
mod test {
    #![allow(clippy::too_many_arguments)]
    use super::*;

    #[test]
    fn test_build_item_stats_query_min_unix_timestamp() {
        let min_unix_timestamp = 1672531200;
        let query = ItemStatsQuery {
            min_unix_timestamp: min_unix_timestamp.into(),
            ..Default::default()
        };
        let query_str = build_item_stats_query(&query);
        assert!(query_str.contains(&format!("start_time >= {min_unix_timestamp}")));
    }

    #[test]
    fn test_build_item_stats_query_max_unix_timestamp() {
        let max_unix_timestamp = 1675209599;
        let query = ItemStatsQuery {
            max_unix_timestamp: max_unix_timestamp.into(),
            ..Default::default()
        };
        let query_str = build_item_stats_query(&query);
        assert!(query_str.contains(&format!("start_time <= {max_unix_timestamp}")));
    }

    #[test]
    fn test_build_item_stats_query_min_duration_s() {
        let min_duration_s = 600;
        let query = ItemStatsQuery {
            min_duration_s: min_duration_s.into(),
            ..Default::default()
        };
        let query_str = build_item_stats_query(&query);
        assert!(query_str.contains(&format!("duration_s >= {min_duration_s}")));
    }

    #[test]
    fn test_build_item_stats_query_max_duration_s() {
        let max_duration_s = 1800;
        let query = ItemStatsQuery {
            max_duration_s: max_duration_s.into(),
            ..Default::default()
        };
        let query_str = build_item_stats_query(&query);
        assert!(query_str.contains(&format!("duration_s <= {max_duration_s}")));
    }

    #[test]
    fn test_build_item_stats_query_min_average_badge() {
        let min_average_badge = 1;
        let query = ItemStatsQuery {
            min_average_badge: min_average_badge.into(),
            ..Default::default()
        };
        let query_str = build_item_stats_query(&query);
        assert!(query_str.contains(&format!(
            "average_badge_team0 >= {min_average_badge} AND average_badge_team1 >= {min_average_badge}"
        )));
    }

    #[test]
    fn test_build_item_stats_query_max_average_badge() {
        let max_average_badge = 116;
        let query = ItemStatsQuery {
            max_average_badge: max_average_badge.into(),
            ..Default::default()
        };
        let query_str = build_item_stats_query(&query);
        assert!(query_str.contains(&format!(
            "average_badge_team0 <= {max_average_badge} AND average_badge_team1 <= {max_average_badge}"
        )));
    }

    #[test]
    fn test_build_item_stats_query_min_match_id() {
        let min_match_id = 10000;
        let query = ItemStatsQuery {
            min_match_id: min_match_id.into(),
            ..Default::default()
        };
        let query_str = build_item_stats_query(&query);
        assert!(query_str.contains(&format!("match_id >= {min_match_id}")));
    }

    #[test]
    fn test_build_item_stats_query_max_match_id() {
        let max_match_id = 1000000;
        let query = ItemStatsQuery {
            max_match_id: max_match_id.into(),
            ..Default::default()
        };
        let query_str = build_item_stats_query(&query);
        assert!(query_str.contains(&format!("match_id <= {max_match_id}")));
    }

    #[test]
    fn test_build_item_stats_query_account_id() {
        let account_id = 18373975;
        let query = ItemStatsQuery {
            account_id: account_id.into(),
            ..Default::default()
        };
        let query_str = build_item_stats_query(&query);
        assert!(query_str.contains(&format!("account_id = {account_id}")));
    }

    #[test]
    fn test_build_item_stats_query_min_matches() {
        let min_matches = 10;
        let query = ItemStatsQuery {
            min_matches: min_matches.into(),
            ..Default::default()
        };
        let query_str = build_item_stats_query(&query);
        assert!(query_str.contains(&format!("matches >= {min_matches}")));
    }

    #[test]
    fn test_build_item_stats_query_hero_id() {
        let hero_id = 15;
        let query = ItemStatsQuery {
            hero_id: hero_id.into(),
            ..Default::default()
        };
        let query_str = build_item_stats_query(&query);
        assert!(query_str.contains(&format!("hero_id = {hero_id}")));
    }
}
