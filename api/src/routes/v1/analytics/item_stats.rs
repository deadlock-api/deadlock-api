#![allow(clippy::large_stack_arrays)]

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use strum::Display;
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{
    MatchInfoFilters, PlayerFilters, default_min_matches_u32, filter_protected_accounts,
    join_filters, round_timestamps,
};
use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::GameMode;
use crate::utils::parse::{
    comma_separated_deserialize_option, default_last_month_timestamp, parse_steam_id_option,
};

fn default_min_matches() -> Option<u32> {
    default_min_matches_u32()
}

#[derive(Debug, Clone, Copy, Deserialize, ToSchema, Default, Display, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum BucketQuery {
    /// No Bucketing
    #[default]
    NoBucket,
    /// Bucket Item Stats By Hero
    Hero,
    /// Bucket Item Stats By Team
    Team,
    /// Bucket Item Stats By Start Time (Hour)
    StartTimeHour,
    /// Bucket Item Stats By Start Time (Day)
    StartTimeDay,
    /// Bucket Item Stats By Start Time (Week)
    StartTimeWeek,
    /// Bucket Item Stats By Start Time (Month)
    StartTimeMonth,
    /// Bucket Item Stats by Game Time (Minutes)
    GameTimeMin,
    /// Bucket Item Stats by Game Time Normalized with the match duration
    GameTimeNormalizedPercentage,
    /// Bucket Item Stats by Net Worth (grouped by 1000)
    #[serde(rename = "net_worth_by_1000")]
    #[strum(to_string = "net_worth_by_1000")]
    NetWorthBy1000,
    /// Bucket Item Stats by Net Worth (grouped by 2000)
    #[serde(rename = "net_worth_by_2000")]
    #[strum(to_string = "net_worth_by_2000")]
    NetWorthBy2000,
    /// Bucket Item Stats by Net Worth (grouped by 3000)
    #[serde(rename = "net_worth_by_3000")]
    #[strum(to_string = "net_worth_by_3000")]
    NetWorthBy3000,
    /// Bucket Item Stats by Net Worth (grouped by 5000)
    #[serde(rename = "net_worth_by_5000")]
    #[strum(to_string = "net_worth_by_5000")]
    NetWorthBy5000,
    /// Bucket Item Stats by Net Worth (grouped by 10000)
    #[serde(rename = "net_worth_by_10000")]
    #[strum(to_string = "net_worth_by_10000")]
    NetWorthBy10000,
}

impl BucketQuery {
    fn get_select_clause(self) -> &'static str {
        match self {
            Self::NoBucket => "toUInt32(0)",
            Self::Hero => "hero_id",
            Self::Team => "toUInt32(if(team = 'Team0', 0, 1))",
            Self::StartTimeHour => "toStartOfHour(start_time)",
            Self::StartTimeDay => "toStartOfDay(start_time)",
            Self::StartTimeWeek => "toDateTime(toStartOfWeek(start_time))",
            Self::StartTimeMonth => "toDateTime(toStartOfMonth(start_time))",
            Self::GameTimeMin => "toUInt32(floor(buy_time / 60))",
            Self::GameTimeNormalizedPercentage => {
                "toUInt32(floor((buy_time - 1) / duration_s * 100))"
            }
            Self::NetWorthBy1000 => "toUInt32(floor(net_worth_at_buy / 1000) * 1000)",
            Self::NetWorthBy2000 => "toUInt32(floor(net_worth_at_buy / 2000) * 2000)",
            Self::NetWorthBy3000 => "toUInt32(floor(net_worth_at_buy / 3000) * 3000)",
            Self::NetWorthBy5000 => "toUInt32(floor(net_worth_at_buy / 5000) * 5000)",
            Self::NetWorthBy10000 => "toUInt32(floor(net_worth_at_buy / 10000) * 10000)",
        }
    }
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash, Default)]
pub(crate) struct ItemStatsQuery {
    /// Bucket allows you to group the stats by a specific field.
    #[serde(default)]
    #[param(inline)]
    bucket: BucketQuery,
    /// Filter matches based on their game mode. Valid values: `normal`, `street_brawl`. **Default:** `normal`.
    #[serde(default = "GameMode::default_option")]
    #[param(inline, default = "normal")]
    game_mode: Option<GameMode>,
    /// Filter matches based on the hero IDs. See more: <https://assets.deadlock-api.com/v2/heroes>
    #[param(value_type = Option<String>)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    hero_ids: Option<Vec<u32>>,
    /// Filter matches based on the hero ID. See more: <https://assets.deadlock-api.com/v2/heroes>
    #[deprecated(note = "Use hero_ids instead")]
    hero_id: Option<u32>,
    /// Filter matches based on their start time (Unix timestamp). **Default:** 30 days ago.
    #[serde(default = "default_last_month_timestamp")]
    #[param(default = default_last_month_timestamp)]
    min_unix_timestamp: Option<i64>,
    /// Filter matches based on their start time (Unix timestamp).
    max_unix_timestamp: Option<i64>,
    /// Filter matches based on their duration in seconds (up to 7000s).
    #[param(maximum = 7000)]
    min_duration_s: Option<u64>,
    /// Filter matches based on their duration in seconds (up to 7000s).
    #[param(maximum = 7000)]
    max_duration_s: Option<u64>,
    /// Filter players based on their final net worth.
    min_networth: Option<u64>,
    /// Filter players based on their final net worth.
    max_networth: Option<u64>,
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
    /// Comma separated list of item ids to include. See more: <https://assets.deadlock-api.com/v2/items>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    include_item_ids: Option<Vec<u32>>,
    /// Comma separated list of item ids to exclude. See more: <https://assets.deadlock-api.com/v2/items>
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    exclude_item_ids: Option<Vec<u32>>,
    /// The minimum number of matches played for an item to be included in the response.
    #[serde(default = "default_min_matches")]
    #[param(minimum = 1, default = 20)]
    min_matches: Option<u32>,
    /// The maximum number of matches played for a hero combination to be included in the response.
    #[serde(default)]
    #[param(minimum = 1)]
    max_matches: Option<u32>,
    /// Filter for matches with a specific player account ID.
    #[serde(default, deserialize_with = "parse_steam_id_option")]
    #[deprecated]
    account_id: Option<u32>,
    /// Comma separated list of account ids to include
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    account_ids: Option<Vec<u32>>,
    /// Filter items bought after this game time (seconds).
    min_bought_at_s: Option<u32>,
    /// Filter items bought before this game time (seconds).
    max_bought_at_s: Option<u32>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct ItemStats {
    /// See more: <https://assets.deadlock-api.com/v2/items>
    pub item_id: u32,
    pub bucket: u32,
    pub wins: u64,
    pub losses: u64,
    pub matches: u64,
    players: u64,
    /// Average buy time in seconds (absolute)
    pub avg_buy_time_s: f64,
    /// Average sell time in seconds (absolute, for items that were sold)
    pub avg_sell_time_s: f64,
    /// Average buy time as percentage of match duration
    pub avg_buy_time_relative: f64,
    /// Average sell time as percentage of match duration (for items that were sold)
    pub avg_sell_time_relative: f64,
}

#[allow(clippy::too_many_lines)]
fn build_query(query: &ItemStatsQuery) -> String {
    /* ---------- match_info filters ---------- */
    let info_filters = MatchInfoFilters {
        min_unix_timestamp: query.min_unix_timestamp,
        max_unix_timestamp: query.max_unix_timestamp,
        min_match_id: query.min_match_id,
        max_match_id: query.max_match_id,
        min_average_badge: query.min_average_badge,
        max_average_badge: query.max_average_badge,
        min_duration_s: query.min_duration_s,
        max_duration_s: query.max_duration_s,
    }
    .build();

    /* ---------- match_player filters ---------- */
    let mut hero_ids = query.hero_ids.clone().unwrap_or_default();
    #[allow(deprecated)]
    if let Some(hero_id) = query.hero_id {
        hero_ids.push(hero_id);
    }
    #[allow(deprecated)]
    let mut player_filters = PlayerFilters {
        hero_ids: if hero_ids.is_empty() {
            None
        } else {
            Some(&hero_ids)
        },
        account_id: query.account_id,
        account_ids: query.account_ids.as_deref(),
        min_networth: query.min_networth,
        max_networth: query.max_networth,
        include_item_ids: query.include_item_ids.as_deref(),
        exclude_item_ids: query.exclude_item_ids.as_deref(),
        ..Default::default()
    }
    .build();
    if let Some(min_bought_at_s) = query.min_bought_at_s {
        player_filters.push(format!("buy_time >= {min_bought_at_s}"));
    }
    if let Some(max_bought_at_s) = query.max_bought_at_s {
        player_filters.push(format!("buy_time <= {max_bought_at_s}"));
    }
    let player_filters = join_filters(&player_filters);

    /* ---------- misc ---------- */
    let bucket_expr = query.bucket.get_select_clause();

    let net_worth_expr = if [
        BucketQuery::NetWorthBy1000,
        BucketQuery::NetWorthBy2000,
        BucketQuery::NetWorthBy3000,
        BucketQuery::NetWorthBy5000,
        BucketQuery::NetWorthBy10000,
    ]
    .contains(&query.bucket)
    {
        "
        , coalesce(
            arrayElementOrNull(
                stats.net_worth,
                arrayFirstIndex(ts -> ts >= buy_time, stats.time_stamp_s) - 1
            ), net_worth
        ) AS net_worth_at_buy
        "
    } else {
        ""
    };

    let mut having_filters = vec![];
    if let Some(min_matches) = query.min_matches {
        having_filters.push(format!("matches >= {min_matches}"));
    }
    if let Some(max_matches) = query.max_matches {
        having_filters.push(format!("matches <= {max_matches}"));
    }
    let having_clause = if having_filters.is_empty() {
        String::new()
    } else {
        format!("HAVING {}", having_filters.join(" AND "))
    };
    /* ---------- final query ---------- */
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    format!(
        "
WITH
    t_upgrades AS (SELECT id FROM items WHERE type = 'upgrade'),
    t_matches AS (
        SELECT match_id, start_time, duration_s
        FROM match_info
        WHERE match_mode IN ('Ranked', 'Unranked') AND {game_mode_filter} {info_filters}
    ),
    exploded_players AS (
        SELECT
            team,
            account_id,
            hero_id,
            start_time,
            duration_s,
            item_id,
            won,
            buy_time,
            sold_time
            {net_worth_expr}
        FROM match_player
        INNER JOIN t_matches USING (match_id)
        ARRAY JOIN
            items.item_id AS item_id,
            items.game_time_s AS buy_time,
            items.sold_time_s AS sold_time
        -- IN (SELECT ...) drives match_player partition/MinMax pruning;
        -- the JOIN above only adds a runtime filter, so keep both.
        WHERE match_id IN (SELECT match_id FROM t_matches)
            AND item_id IN t_upgrades
            AND buy_time > 0
            {player_filters}
    )
SELECT
    item_id,
    {bucket_expr}    AS bucket,
    countIf(won)         AS wins,
    countIf(not won)     AS losses,
    wins + losses    AS matches,
    uniq(account_id) AS players,
    avg(buy_time) AS avg_buy_time_s,
    avgIf(sold_time, sold_time > 0) AS avg_sell_time_s,
    avg((buy_time / duration_s) * 100) AS avg_buy_time_relative,
    avgIf((sold_time / duration_s) * 100, sold_time > 0) AS avg_sell_time_relative
FROM exploded_players
GROUP BY item_id, bucket
{having_clause}
ORDER BY item_id, bucket
        "
    )
}

#[cached(
    ty = "TimedCache<String, Vec<ItemStats>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60*60)) }",
    result = true,
    convert = "{ query_str.to_string() }",
    sync_writes = "by_key",
    key = "String"
)]
async fn run_query(
    ch_client: &clickhouse::Client,
    query_str: &str,
) -> clickhouse::error::Result<Vec<ItemStats>> {
    ch_client.query(query_str).fetch_all().await
}

async fn get_item_stats(
    ch_client: &clickhouse::Client,
    mut query: ItemStatsQuery,
) -> APIResult<Vec<ItemStats>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let query = build_query(&query);
    debug!(?query);
    Ok(run_query(ch_client, &query).await?)
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
    description = "
Retrieves item statistics based on historical match data.

Results are cached for **1 hour** based on the unique combination of query parameters provided. Subsequent identical requests within this timeframe will receive the cached response.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(crate) async fn item_stats(
    Query(mut query): Query<ItemStatsQuery>,
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
    #[allow(deprecated)]
    filter_protected_accounts(&state, &mut query.account_ids, query.account_id).await?;
    get_item_stats(&state.ch_client_ro, query).await.map(Json)
}

#[cfg(test)]
mod test {
    use itertools::Itertools;

    use super::*;

    #[test]
    fn test_build_item_stats_query_min_unix_timestamp() {
        let min_unix_timestamp = 1672531200;
        let query = ItemStatsQuery {
            min_unix_timestamp: min_unix_timestamp.into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!("start_time >= {min_unix_timestamp}")));
    }

    #[test]
    fn test_build_item_stats_query_max_unix_timestamp() {
        let max_unix_timestamp = 1675209599;
        let query = ItemStatsQuery {
            max_unix_timestamp: max_unix_timestamp.into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!("start_time <= {max_unix_timestamp}")));
    }

    #[test]
    fn test_build_item_stats_query_min_duration_s() {
        let min_duration_s = 600;
        let query = ItemStatsQuery {
            min_duration_s: min_duration_s.into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!("duration_s >= {min_duration_s}")));
    }

    #[test]
    fn test_build_item_stats_query_max_duration_s() {
        let max_duration_s = 1800;
        let query = ItemStatsQuery {
            max_duration_s: max_duration_s.into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!("duration_s <= {max_duration_s}")));
    }

    #[test]
    fn test_build_item_stats_query_min_networth() {
        let min_networth = 1000;
        let query = ItemStatsQuery {
            min_networth: min_networth.into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!("net_worth >= {min_networth}")));
    }
    #[test]
    fn test_build_item_stats_query_max_networth() {
        let max_networth = 10000;
        let query = ItemStatsQuery {
            max_networth: max_networth.into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!("net_worth <= {max_networth}")));
    }

    #[test]
    fn test_build_item_stats_query_min_average_badge() {
        let min_average_badge = 61;
        let query = ItemStatsQuery {
            min_average_badge: min_average_badge.into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!(
            "average_badge_team0 >= {min_average_badge} AND average_badge_team1 >= \
             {min_average_badge}"
        )));
    }

    #[test]
    fn test_build_item_stats_query_max_average_badge() {
        let max_average_badge = 112;
        let query = ItemStatsQuery {
            max_average_badge: max_average_badge.into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!(
            "average_badge_team0 <= {max_average_badge} AND average_badge_team1 <= \
             {max_average_badge}"
        )));
    }

    #[test]
    fn test_build_item_stats_query_min_match_id() {
        let min_match_id = 10000;
        let query = ItemStatsQuery {
            min_match_id: min_match_id.into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!("match_id >= {min_match_id}")));
    }

    #[test]
    fn test_build_item_stats_query_max_match_id() {
        let max_match_id = 1000000;
        let query = ItemStatsQuery {
            max_match_id: max_match_id.into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!("match_id <= {max_match_id}")));
    }

    #[test]
    fn test_build_item_stats_query_account_id() {
        let account_id = 18373975;
        let query = ItemStatsQuery {
            account_ids: Some(vec![account_id]),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!("account_id IN ({account_id})")));
    }

    #[test]
    fn test_build_item_stats_query_min_matches() {
        let min_matches = 10;
        let query = ItemStatsQuery {
            min_matches: min_matches.into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!("matches >= {min_matches}")));
    }

    #[test]
    fn test_build_item_stats_query_hero_ids() {
        let hero_ids = vec![1, 2, 3];
        let query = ItemStatsQuery {
            hero_ids: hero_ids.clone().into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!(
            "hero_id IN ({})",
            hero_ids.iter().map(ToString::to_string).join(", ")
        )));
    }

    #[test]
    fn test_build_item_stats_query_min_bought_at_s() {
        let min_bought_at_s = 300;
        let query = ItemStatsQuery {
            min_bought_at_s: min_bought_at_s.into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!("buy_time >= {min_bought_at_s}")));
    }

    #[test]
    fn test_build_item_stats_query_max_bought_at() {
        let max_bought_at_s = 600;
        let query = ItemStatsQuery {
            max_bought_at_s: max_bought_at_s.into(),
            ..Default::default()
        };
        let query_str = build_query(&query);
        assert!(query_str.contains(&format!("buy_time <= {max_bought_at_s}")));
    }
}
