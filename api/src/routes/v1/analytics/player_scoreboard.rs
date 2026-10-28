use std::sync::Arc;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use clickhouse::Row;
use itertools::Itertools as _;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

use super::common_filters::{
    default_min_matches_u32, filter_protected_accounts, is_non_empty, range_filters,
    round_timestamps,
};
use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::analytics::scoreboard_types::ScoreboardQuerySortBy;
use crate::routes::v1::matches::types::{GameMode, MatchMode, reject_brawl_badge_filter};
use crate::utils::parse::{comma_separated_deserialize_option, comma_separated_steam_ids_option};
use crate::utils::sql::{cached_ch_query, having_clause, id_list, impl_match_info};
use crate::utils::types::SortDirectionDesc;

fn default_limit() -> Option<u32> {
    100.into()
}

#[derive(Eq, Hash, PartialEq, Debug, Clone, Deserialize, IntoParams, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
pub(crate) struct PlayerScoreboardQuery {
    /// The field to sort by.
    #[param(inline)]
    sort_by: ScoreboardQuerySortBy,
    /// The direction to sort players in.
    #[serde(default)]
    #[param(inline)]
    sort_direction: SortDirectionDesc,
    /// Filter matches based on their game mode. Valid values: `normal`, `street_brawl`. **Default:** `normal`.
    #[serde(
        default = "GameMode::default_option",
        deserialize_with = "GameMode::deserialize_option"
    )]
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
    /// Filter matches based on the hero ID. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    hero_id: Option<u32>,
    /// Only matches the player started with this hero build selected. Matches without a processed demo record no
    /// build. See more: <https://api.deadlock-api.com/v1/analytics/hero-build-stats/{hero_id}>
    hero_build_id: Option<u64>,
    /// The minimum number of matches played for a player to be included in the scoreboard.
    #[serde(default = "default_min_matches_u32")]
    #[param(minimum = 1, default = 20)]
    min_matches: Option<u32>,
    /// The maximum number of matches played for a hero combination to be included in the response.
    #[serde(default)]
    #[param(minimum = 1)]
    max_matches: Option<u32>,
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
    /// Filter players based on their final net worth.
    min_networth: Option<u64>,
    /// Filter players based on their final net worth.
    max_networth: Option<u64>,
    /// Filter matches based on the average badge level (tier = first digits, subtier = last digit) of *both* teams involved. See more: <https://api.deadlock-api.com/v1/assets/ranks>
    #[param(minimum = 0, maximum = 116)]
    min_average_badge: Option<u8>,
    /// Filter matches based on the average badge level (tier = first digits, subtier = last digit) of *both* teams involved. See more: <https://api.deadlock-api.com/v1/assets/ranks>
    #[param(minimum = 0, maximum = 116)]
    max_average_badge: Option<u8>,
    /// Filter matches based on their ID.
    min_match_id: Option<u64>,
    /// Filter matches based on their ID.
    max_match_id: Option<u64>,
    /// The rank to start fetching players from (1-based, like `rank`).
    start: Option<u32>,
    /// The maximum number of players to fetch.
    #[serde(default = "default_limit")]
    #[param(inline, default = "100", maximum = 10000, minimum = 1)]
    limit: Option<u32>,
    /// Comma separated list of account ids to include
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(default, deserialize_with = "comma_separated_steam_ids_option")]
    #[cfg_attr(
        test,
        proptest(strategy = "crate::utils::proptest_utils::arb_small_u32_list()")
    )]
    account_ids: Option<Vec<u32>>,
}

impl_match_info!(PlayerScoreboardQuery);

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct PlayerEntry {
    rank: u64,
    account_id: u32,
    pub value: f64,
    pub matches: u64,
    /// `rank` and `peak_rank` sorts only: the rank badge the progress in `value` falls in, `0`
    /// when the player has no ranked match in range. Omitted for every other sort.
    /// See more: <https://api.deadlock-api.com/v1/assets/ranks>
    #[serde(skip_serializing_if = "Option::is_none")]
    pub badge: Option<u32>,
    /// `rank` and `peak_rank` sorts only: progress points into `badge`. A subrank spans 1000
    /// points, the sixth of a tier 2000. `null` in Eternus, whose subranks are percentile cuts
    /// rather than point spans, and when the player has no ranked match in range.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub badge_progress: Option<u32>,
}

/// Picks the `FROM`/dedup strategy: returns the from-clause, whether the outer query keeps the
/// `WHERE`, and the per-account match-count expression.
fn from_clause_parts(
    query: &PlayerScoreboardQuery,
    table: &str,
    where_clause: &str,
) -> (String, bool, &'static str) {
    // FINAL streams the ReplacingMergeTree merge during read and beats the
    // hand-rolled (account_id, match_id) GROUP BY dedup 3-7x, but blocks the
    // planner from picking hero_stats_by_hero or the account_id bloom-filter
    // index — so when hero_id or account_ids is set, the inline dedup wins.
    // On the unscoped full-table read FINAL + count() also beats the raw
    // uniq(match_id) scan (measured 41% less wall time, 90% less peak memory)
    // and is exact where uniq loses a match to a hash collision.
    let use_final =
        query.hero_id.is_none() && query.account_ids.is_none() && query.hero_build_id.is_none();

    if use_final {
        (format!(" FROM {table} FINAL "), true, "count()")
    } else if query.sort_by.dedup_free() {
        (format!(" FROM {table} "), true, "uniq(match_id)")
    } else {
        let inner_projection = query
            .sort_by
            .inner_columns()
            .iter()
            .map(|col| format!(", any({col}) as {col}"))
            .join("");
        (
            format!(
                "
FROM (
    SELECT account_id, match_id{inner_projection}
    FROM {table}
    {where_clause}
    GROUP BY account_id, match_id
)"
            ),
            false,
            "uniq(match_id)",
        )
    }
}

fn build_query(query: &PlayerScoreboardQuery) -> String {
    let match_info_filters = query.match_info().build();
    let game_mode_filter = GameMode::sql_filter(query.game_mode);
    let match_mode_filter = MatchMode::sql_filter(query.match_mode.as_deref());
    let mut inner_filters = vec![
        "account_id > 0".to_owned(),
        format!("{match_mode_filter} AND {game_mode_filter} {match_info_filters}"),
    ];
    // Account-scoped reads are primary-key ranges on player_match_stats but open every part of
    // match_player, and an all-time scan aggregates there in sort order instead of hashing
    // every account (~15 GiB peak). Time and hero filters stay on match_player, whose
    // partitions and projections prune them while player_match_stats cannot.
    let has_account_filter = is_non_empty(query.account_ids.as_deref());
    // Buff sorts read match_player.permanent_buffs: player_match_stats only has it for rows
    // ingested since it was added. The handler requires a time or match-id lower bound for
    // them so this never scans the full history.
    // `player_match_stats` has no build column.
    let table = if query.sort_by.is_buff_sort() || query.hero_build_id.is_some() {
        "match_player"
    } else if has_account_filter || (match_info_filters.is_empty() && query.hero_id.is_none()) {
        "player_match_stats"
    } else {
        "match_player"
    };
    if let Some(hero_id) = query.hero_id {
        inner_filters.push(format!("hero_id = {hero_id}"));
    }
    if let Some(hero_build_id) = query.hero_build_id {
        inner_filters.push(format!("hero_build_id = {hero_build_id}"));
    }
    inner_filters.extend(range_filters(
        "net_worth",
        query.min_networth,
        query.max_networth,
    ));
    if let Some(account_ids) = &query.account_ids {
        inner_filters.push(format!("has([{}], account_id)", id_list(account_ids)));
    }
    let where_clause = format!(" WHERE {} ", inner_filters.join(" AND "));

    let (from_clause, needs_outer_where, matches_expr) =
        from_clause_parts(query, table, &where_clause);
    let outer_where = if needs_outer_where {
        where_clause.as_str()
    } else {
        ""
    };

    let mut having_filters = range_filters(matches_expr, query.min_matches, query.max_matches);
    // Players without a ranked match in range have badge 0 and value 0: they are not listed,
    // or an ascending rank sort would start with all of them.
    if query.sort_by.is_rank_sort() {
        having_filters.push("badge > 0".to_owned());
    }
    let having_clause = having_clause(&having_filters);
    let offset = query.start.unwrap_or(1).saturating_sub(1);
    let select_clause = if query.sort_by.dedup_free() {
        matches_expr.to_owned()
    } else {
        query.sort_by.get_select_clause()
    };
    let sort_direction = query.sort_direction;
    let (badge_clause, badge_progress_clause) = query.sort_by.badge_columns().map_or_else(
        || ("NULL".to_owned(), "NULL".to_owned()),
        |c| (c.badge, c.badge_progress),
    );
    let limit = query.limit.unwrap_or_default();
    let first_rank = offset.saturating_add(1);

    format!(
        "
SELECT rowNumberInAllBlocks() + {first_rank} as rank, account_id, toFloat64({select_clause}) as \
         value, {matches_expr} as matches, CAST({badge_clause}, 'Nullable(UInt32)') as badge, \
         CAST({badge_progress_clause}, 'Nullable(UInt32)') as badge_progress
{from_clause}
{outer_where}
GROUP BY account_id
{having_clause}
ORDER BY value {sort_direction}
LIMIT {limit} OFFSET {offset}
SETTINGS log_comment = 'player_scoreboard', apply_patch_parts = 0, do_not_merge_across_partitions_select_final = 1
    "
    )
}

/// Pages past the first are cut out of cached blocks of this many ranks. Every page re-runs the
/// full aggregation, so a client walking the unscoped scoreboard used to cost one 2s full scan
/// per page and timed out when it fetched dozens in parallel. First pages keep their exact
/// `LIMIT`: widening them to a block costs 10-35% more wall time (measured on 2026-10-04).
/// A block spans five maximum-size pages: a client walking the all-time scoreboard 10k at a time
/// ran one 60 CPU-s aggregation per page, and a 50k block costs the same as a 10k one (no
/// significant wall or memory difference, measured on 2026-10-18).
const PAGE_BLOCK_SIZE: u32 = 50_000;

cached_ch_query! {
    fn run_query(3600) -> Vec<PlayerEntry>;
}

cached_ch_query! {
    fn run_block_query(3600) -> Vec<PlayerEntry>;
}

/// The block-aligned queries covering ranks `offset + 1..=offset + limit`: at most two, as
/// `limit <= PAGE_BLOCK_SIZE`.
fn build_block_queries(query: &PlayerScoreboardQuery, offset: u32, limit: u32) -> Vec<String> {
    let first_block = offset / PAGE_BLOCK_SIZE;
    let last_block = offset.saturating_add(limit).saturating_sub(1) / PAGE_BLOCK_SIZE;
    (first_block..=last_block)
        .map(|block| {
            build_query(&PlayerScoreboardQuery {
                start: Some(block.saturating_mul(PAGE_BLOCK_SIZE).saturating_add(1)),
                limit: Some(PAGE_BLOCK_SIZE),
                ..query.clone()
            })
        })
        .collect()
}

async fn get_player_scoreboard(
    ch_client: &clickhouse::Client,
    mut query: PlayerScoreboardQuery,
) -> APIResult<Arc<Vec<PlayerEntry>>> {
    round_timestamps(&mut query.min_unix_timestamp, &mut query.max_unix_timestamp);
    let offset = query.start.unwrap_or(1).saturating_sub(1);
    let limit = query.limit.unwrap_or_default();
    // `limit` is unbounded, so a page wider than a block reads directly instead of walking
    // up to every block of the scoreboard.
    if offset == 0 || limit == 0 || limit > PAGE_BLOCK_SIZE {
        let query = build_query(&query);
        debug!(?query);
        return Ok(run_query(ch_client, &query).await?);
    }

    let wanted =
        u64::from(offset).saturating_add(1)..=u64::from(offset).saturating_add(u64::from(limit));
    let mut entries = Vec::with_capacity(limit as usize);
    for block_query in build_block_queries(&query, offset, limit) {
        debug!(?block_query);
        let block = run_block_query(ch_client, &block_query).await?;
        entries.extend(block.iter().filter(|e| wanted.contains(&e.rank)).cloned());
        if block.len() < PAGE_BLOCK_SIZE as usize {
            break;
        }
    }
    Ok(Arc::new(entries))
}

#[utoipa::path(
    get,
    path = "/players",
    params(PlayerScoreboardQuery),
    responses(
        (status = OK, description = "Player Scoreboard", body = [PlayerEntry]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch player scoreboard")
    ),
    tags = ["Analytics"],
    summary = "Player Scoreboard",
    description = "
This endpoint returns the player scoreboard.

### Rate Limits:
> The rate limits below are **shared across all analytics endpoints**.

| Type | Limit |
| ---- | ----- |
| IP | 200req/min |
| Key | 400req/min |
| Global | 2000req/min |
    "
)]
pub(crate) async fn player_scoreboard(
    Query(mut query): Query<PlayerScoreboardQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    reject_brawl_badge_filter(
        query.game_mode,
        query.min_average_badge,
        query.max_average_badge,
    )?;
    if query.sort_by.is_buff_sort()
        && query.min_unix_timestamp.is_none()
        && query.min_match_id.is_none()
    {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Buff sorts require min_unix_timestamp or min_match_id",
        ));
    }
    filter_protected_accounts(&state, &mut query.account_ids, None).await?;
    get_player_scoreboard(&state.ch_client_ro, query)
        .await
        .map(Json)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    #[test]
    fn pages_map_onto_block_aligned_queries() {
        let query = PlayerScoreboardQuery {
            sort_by: ScoreboardQuerySortBy::Matches,
            ..Default::default()
        };
        let inside = build_block_queries(&query, 7_699, 100);
        assert_eq!(
            inside,
            vec![build_query(&PlayerScoreboardQuery {
                start: Some(1),
                limit: Some(PAGE_BLOCK_SIZE),
                ..query.clone()
            })]
        );
        assert!(inside[0].contains("rowNumberInAllBlocks() + 1 as rank"));
        assert!(inside[0].contains("LIMIT 50000 OFFSET 0"));

        // Maximum-size pages 2-5 share the first block.
        assert_eq!(build_block_queries(&query, 30_000, 10_000), inside);

        let straddling = build_block_queries(&query, 49_950, 100);
        assert_eq!(straddling.len(), 2);
        assert!(straddling[1].contains("rowNumberInAllBlocks() + 50001 as rank"));
        assert!(straddling[1].contains("LIMIT 50000 OFFSET 50000"));

        assert_eq!(
            build_block_queries(&query, 50_000, PAGE_BLOCK_SIZE).len(),
            1
        );
        assert_eq!(
            build_block_queries(&query, u32::MAX - 1, PAGE_BLOCK_SIZE).len(),
            1
        );
    }

    #[test]
    fn buff_sorts_read_match_player_and_carry_the_buff_column_through_the_dedup() {
        let sql = build_query(&PlayerScoreboardQuery {
            sort_by: ScoreboardQuerySortBy::AvgPermanentBuffsPerMatch,
            hero_id: Some(15),
            account_ids: Some(vec![1, 2]),
            min_unix_timestamp: Some(1_790_121_600),
            ..Default::default()
        });
        assert_valid_sql(&sql);
        assert!(sql.contains("FROM match_player"));
        assert!(!sql.contains("player_match_stats"));
        assert!(sql.contains(", any(permanent_buffs) as permanent_buffs"));
        assert!(sql.contains("toFloat64(avg(permanent_buffs)) as value"));

        let unscoped = build_query(&PlayerScoreboardQuery {
            sort_by: ScoreboardQuerySortBy::PermanentBuffs,
            min_match_id: Some(108_000_000),
            ..Default::default()
        });
        assert_valid_sql(&unscoped);
        assert!(unscoped.contains("FROM match_player FINAL"));
    }

    #[test]
    fn rank_sort_carries_both_rank_columns_through_the_dedup_subquery() {
        let sql = build_query(&PlayerScoreboardQuery {
            sort_by: ScoreboardQuerySortBy::Rank,
            // hero_id forces the inline dedup path over FINAL.
            hero_id: Some(15),
            ..Default::default()
        });
        assert_valid_sql(&sql);
        assert!(
            sql.contains(
                ", any(player_rank_final_flat_progress) as player_rank_final_flat_progress"
            )
        );
        assert!(sql.contains(
            ", any(player_rank_initial_display_rank) as player_rank_initial_display_rank"
        ));
        assert!(sql.contains("argMaxIf(player_rank_final_flat_progress, match_id"));
    }

    #[test]
    fn rank_sort_is_valid_sql_on_the_final_path() {
        let sql = build_query(&PlayerScoreboardQuery {
            sort_by: ScoreboardQuerySortBy::Rank,
            ..Default::default()
        });
        assert_valid_sql(&sql);
        assert!(sql.contains("FROM player_match_stats FINAL"));
        assert!(sql.contains("argMaxIf(player_rank_final_flat_progress, match_id"));
    }

    #[test]
    fn peak_rank_sort_takes_the_highest_ranked_progress_on_both_paths() {
        let deduped = build_query(&PlayerScoreboardQuery {
            sort_by: ScoreboardQuerySortBy::PeakRank,
            hero_id: Some(15),
            ..Default::default()
        });
        assert_valid_sql(&deduped);
        assert!(deduped.contains(
            ", any(player_rank_initial_display_rank) as player_rank_initial_display_rank"
        ));
        assert!(deduped.contains(
            "toFloat64(ifNull(maxIf(player_rank_final_flat_progress, \
             ifNull(player_rank_initial_display_rank, 0) > 0), 0)) as value"
        ));
        // The Eternus division comes from the row that set the peak.
        assert!(deduped.contains(
            "argMaxIf(player_rank_initial_display_rank, player_rank_final_flat_progress,"
        ));

        let unscoped = build_query(&PlayerScoreboardQuery {
            sort_by: ScoreboardQuerySortBy::PeakRank,
            ..Default::default()
        });
        assert_valid_sql(&unscoped);
        assert!(unscoped.contains("FROM player_match_stats FINAL"));
    }

    #[test]
    fn time_and_hero_filtered_scans_stay_on_match_player() {
        let by_time = build_query(&PlayerScoreboardQuery {
            min_unix_timestamp: Some(1_785_715_200),
            ..Default::default()
        });
        assert!(by_time.contains("FROM match_player "));
        let by_hero = build_query(&PlayerScoreboardQuery {
            hero_id: Some(15),
            ..Default::default()
        });
        assert!(by_hero.contains("FROM match_player "));
    }

    #[test]
    fn account_scoped_scans_read_player_match_stats_even_with_a_time_filter() {
        let sql = build_query(&PlayerScoreboardQuery {
            account_ids: Some(vec![1, 2]),
            min_unix_timestamp: Some(1_785_715_200),
            ..Default::default()
        });
        assert!(sql.contains("FROM player_match_stats "));
        assert!(!sql.contains("match_player"));
    }

    #[test]
    fn mode_filters_apply_without_other_match_filters() {
        let default_modes = build_query(&PlayerScoreboardQuery {
            game_mode: Some(GameMode::Normal),
            ..Default::default()
        });
        assert!(
            default_modes.contains("match_mode IN ('Ranked', 'Unranked') AND game_mode = 1"),
            "{default_modes}"
        );
        assert!(default_modes.contains("FROM player_match_stats FINAL"));

        let ranked = build_query(&PlayerScoreboardQuery {
            match_mode: Some(vec![MatchMode::Ranked]),
            ..Default::default()
        });
        assert!(ranked.contains("match_mode = 'Ranked'"), "{ranked}");
        assert!(ranked.contains("FROM player_match_stats FINAL"));
    }

    #[test]
    fn matches_sort_uses_final_count_on_the_unscoped_read() {
        let sql = build_query(&PlayerScoreboardQuery {
            sort_by: ScoreboardQuerySortBy::Matches,
            ..Default::default()
        });
        assert_valid_sql(&sql);
        assert!(sql.contains("FROM player_match_stats FINAL"));
        assert!(sql.contains("toFloat64(count()) as value, count() as matches"));
        assert!(!sql.contains("uniq(match_id)"));
    }

    #[test]
    fn matches_sort_keeps_the_raw_uniq_read_when_hero_scoped() {
        let sql = build_query(&PlayerScoreboardQuery {
            sort_by: ScoreboardQuerySortBy::Matches,
            hero_id: Some(15),
            ..Default::default()
        });
        assert_valid_sql(&sql);
        assert!(sql.contains("FROM match_player "));
        assert!(!sql.contains("FINAL"));
        assert!(sql.contains("toFloat64(uniq(match_id)) as value, uniq(match_id) as matches"));
    }

    #[test]
    fn rank_sort_falls_back_to_zero_when_no_ranked_match_is_in_range() {
        let sql = build_query(&PlayerScoreboardQuery {
            sort_by: ScoreboardQuerySortBy::Rank,
            ..Default::default()
        });
        assert!(sql.contains(
            "toFloat64(ifNull(argMaxIf(player_rank_final_flat_progress, match_id, \
             ifNull(player_rank_initial_display_rank, 0) > 0), 0)) as value"
        ));
        assert!(sql.contains("IS NULL, 0,"));
    }

    #[test]
    fn rank_sorts_do_not_list_unranked_players() {
        for sort_by in [ScoreboardQuerySortBy::Rank, ScoreboardQuerySortBy::PeakRank] {
            for sort_direction in [SortDirectionDesc::Asc, SortDirectionDesc::Desc] {
                let sql = build_query(&PlayerScoreboardQuery {
                    sort_by,
                    sort_direction,
                    ..Default::default()
                });
                assert_valid_sql(&sql);
                assert!(sql.contains("HAVING badge > 0"));
                assert!(sql.contains(&format!("ORDER BY value {sort_direction}")));
            }
        }
        let kills = build_query(&PlayerScoreboardQuery {
            sort_by: ScoreboardQuerySortBy::Kills,
            ..Default::default()
        });
        assert!(!kills.contains("badge > 0"));
    }

    #[test]
    fn only_rank_sorts_report_a_badge() {
        let kills = build_query(&PlayerScoreboardQuery {
            sort_by: ScoreboardQuerySortBy::Kills,
            ..Default::default()
        });
        assert_valid_sql(&kills);
        assert!(kills.contains("CAST(NULL, 'Nullable(UInt32)') as badge,"));
        assert!(kills.contains("CAST(NULL, 'Nullable(UInt32)') as badge_progress"));
        let rank = build_query(&PlayerScoreboardQuery {
            sort_by: ScoreboardQuerySortBy::Rank,
            ..Default::default()
        });
        assert!(!rank.contains("CAST(NULL,"));
        assert_valid_sql(&rank);
        assert!(rank.contains("'Nullable(UInt32)') as badge,"));
        assert!(rank.contains("'Nullable(UInt32)') as badge_progress"));
        assert!(rank.contains("% 1000 + if(intDiv("));
    }
}

#[cfg(test)]
mod proptests {
    use proptest::prelude::*;

    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    proptest! {
        #![proptest_config(ProptestConfig { cases: 32, max_shrink_iters: 16, failure_persistence: None, .. ProptestConfig::default() })]

        #[test]
        fn player_scoreboard_build_query_is_valid_sql(query: PlayerScoreboardQuery) {
            assert_valid_sql(&build_query(&query));
        }
    }
}
