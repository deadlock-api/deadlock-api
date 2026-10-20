//! The hero-pair rollup behind `hero-counter-stats` and `hero-synergy-stats`.
//!
//! Both endpoints pair up the players of each match, enemies (ordered pairs from opposing teams)
//! and allies (teammates, the lower hero id first), and sum their stats per pair of heroes. On
//! `match_player` that is a FINAL scan and a self-join or array expansion of every player row of
//! the window: ~15-20 s for 30 days of ranked and unranked matches, at the 20 s timeout. The
//! rollup keeps those sums per day, match-level grain and pair, so a request reads ~300k rows a
//! day instead.

use super::rollup_window::{Coverage, DaySplit, EdgeRows, Rollup, RollupFilters};
use crate::routes::v1::matches::types::{GameMode, MatchMode};

/// The rollup, rebuilt per day by `services/cohort_agg_refresh.rs` from [`agg_select_body`].
/// Its columns are [`AGG_GRAIN`], then [`AGG_MEASURES`], then `built_through`.
pub(crate) const AGG_TABLE: &str = "default.hero_pair_stats_agg";
pub(crate) const AGG_STAGING: &str = "default.hero_pair_stats_agg_staging";
/// Days the refresh job checks for new matches every run. It keeps every day since
/// [`AGG_FIRST_DAY`], rebuilding the rest once their build is a week old.
pub(crate) const AGG_HORIZON_DAYS: u32 = 120;
/// The first day the rollup keeps: the data has no matches from 2024-04-30 to 2024-05-17, and
/// reads prune their late-match scans only while the built days form one run (see
/// `rollup_window::BuiltDays`).
pub(crate) const AGG_FIRST_DAY: &str = "2024-05-18";

/// Every column but the pair's is match-level. `enemy` is 1 for players of opposing teams, 0 for
/// teammates; `same_lane` is 1 when both were assigned the same lane. The expressions are on the
/// pair rows of [`agg_rows`], which carry the match columns of `match_player` under their names.
const AGG_GRAIN: &[(&str, &str)] = &[
    ("game_mode", "game_mode"),
    ("match_mode", "match_mode"),
    ("least_badge", "ifNull(average_badge, 0)"),
    ("greatest_badge", "ifNull(average_badge, 65535)"),
    ("day", "toDate(start_time)"),
    ("enemy", "enemy"),
    ("same_lane", "same_lane"),
    ("hero_id", "hero_id"),
    ("other_hero_id", "other_hero_id"),
];

/// The per-player stats summed for both players of a pair, `(name, match_player column)`, in
/// the order of the tuples [`agg_rows`] builds (after hero, team, lane and won).
const PAIR_STATS: &[(&str, &str)] = &[
    ("kills", "kills"),
    ("deaths", "deaths"),
    ("assists", "assists"),
    ("denies", "denies"),
    ("last_hits", "last_hits"),
    ("net_worth", "net_worth"),
    ("obj_damage", "max_boss_damage"),
    ("creeps", "max_creep_kills"),
];

/// The rollup's measures in table order: the pair count, `hero_id`'s wins, then each of
/// [`PAIR_STATS`] for `hero_id`'s player and `other_` for the other one.
const AGG_MEASURES: &str = "n_pairs, wins, kills, other_kills, deaths, other_deaths, assists, other_assists, denies, other_denies, last_hits, other_last_hits, net_worth, other_net_worth, obj_damage, other_obj_damage, creeps, other_creeps";

fn hero_pair_agg() -> Rollup<'static> {
    Rollup {
        table: AGG_TABLE,
        grain: AGG_GRAIN,
        measures: AGG_MEASURES,
        // The table keeps every day; the horizon only matters for `Reach::Days`, which neither
        // endpoint uses.
        coverage: Coverage::Incremental {
            horizon_days: u32::MAX,
        },
    }
}

/// The rollup rows of the matches `where_clause` selects, grouped by the grain columns of
/// `grain_select`/`group_by`: a window's partial days, the matches ingested after their day was
/// built, or a whole rollup day.
///
/// Each match's players are collected into one array and paired with each other, as
/// `hero-synergy-stats` always did: one scan instead of the self-join's two. Enemies pair in both
/// orders, teammates once with the lower hero id first.
///
/// Re-ingested `(match_id, account_id)` rows would add their pairs twice, so only the newest
/// version of each counts, as under the endpoints' FINAL (see [`Dedup`]).
fn agg_rows(
    EdgeRows {
        where_clause,
        grain_select,
        group_by,
    }: &EdgeRows,
    dedup: Dedup,
) -> String {
    // Tuple positions: 1 hero_id, 2 team, 3 assigned_lane, 4 won, then PAIR_STATS from 5.
    let player = PAIR_STATS
        .iter()
        .map(|(_, col)| *col)
        .collect::<Vec<_>>()
        .join(", ");
    let pair_columns = PAIR_STATS
        .iter()
        .enumerate()
        .map(|(i, (name, _))| {
            let pos = i + 5;
            format!("(pair.1).{pos} AS {name}, (pair.2).{pos} AS other_{name},\n        ")
        })
        .collect::<Vec<_>>()
        .concat();
    let measures = PAIR_STATS
        .iter()
        .map(|(name, _)| format!(",\n    sum({name}) AS {name}, sum(other_{name}) AS other_{name}"))
        .collect::<Vec<_>>()
        .concat();
    let group_by = if group_by.is_empty() {
        String::new()
    } else {
        format!("\nGROUP BY {group_by}")
    };
    let player_tuple = format!("(hero_id, team, assigned_lane, toUInt8(won), {player})");
    // Every `where_clause` filter is match-level or `created_at` (which only newer versions
    // pass), so under FINAL it applies as PREWHERE, before the versions merge, keeping the same
    // rows.
    let players = match dedup {
        Dedup::Final => format!(
            "SELECT
            game_mode, match_mode, average_badge, start_time,
            groupArray({player_tuple}) AS players
        FROM default.match_player FINAL
        PREWHERE match_mode IN ('Ranked', 'Unranked') AND {where_clause}
        WHERE team IN ('Team0', 'Team1')
        GROUP BY match_id, game_mode, match_mode, average_badge, start_time"
        ),
        Dedup::Newest => format!(
            "SELECT
            game_mode, match_mode, average_badge, start_time,
            groupArray(player) AS players
        FROM (
            SELECT
                match_id, game_mode, match_mode, average_badge, start_time,
                argMax({player_tuple}, created_at) AS player
            FROM default.match_player
            WHERE match_mode IN ('Ranked', 'Unranked') AND {where_clause}
            GROUP BY match_id, account_id, game_mode, match_mode, average_badge, start_time
        )
        WHERE player.2 IN ('Team0', 'Team1')
        GROUP BY match_id, game_mode, match_mode, average_badge, start_time"
        ),
    };
    format!(
        "SELECT
    {grain_select}count() AS n_pairs,
    sum(won) AS wins{measures}
FROM (
    SELECT
        game_mode, match_mode, average_badge, start_time,
        (pair.1).1 AS hero_id,
        (pair.2).1 AS other_hero_id,
        toUInt8((pair.1).2 != (pair.2).2) AS enemy,
        toUInt8((pair.1).3 = (pair.2).3) AS same_lane,
        {pair_columns}(pair.1).4 AS won
    FROM (
        {players}
    )
    ARRAY JOIN arrayFilter(
        pair -> (pair.1).2 != (pair.2).2 OR (pair.1).1 < (pair.2).1,
        arrayFlatten(arrayMap(x -> arrayMap(y -> (x, y), players), players))
    ) AS pair
){group_by}"
    )
}

/// How [`agg_rows`] keeps only the newest version of a re-ingested `(match_id, account_id)`
/// row. Both give the endpoints' results exactly.
#[derive(Clone, Copy)]
enum Dedup {
    /// FINAL: 3.6 CPU-s for a whole day, where `Newest` takes 13.
    Final,
    /// `argMax` by `created_at`, for the reads' scans of a few granules: FINAL made those read
    /// every part's rows in the key ranges of the granules they select, 5-16k granules each
    /// instead of 6-56, ~35M rows on a 30-day window.
    Newest,
}

/// The rollup rows of the matches selected by `since_clause`, at the full grain and in the
/// table's column order. The refresh job builds the rollup's days with it.
pub(crate) fn agg_select_body(since_clause: &str) -> String {
    agg_rows(
        &EdgeRows {
            where_clause: since_clause.to_owned(),
            grain_select: AGG_GRAIN
                .iter()
                .map(|(col, expr)| format!("{expr} AS {col},\n    "))
                .collect::<Vec<_>>()
                .concat(),
            group_by: AGG_GRAIN
                .iter()
                .map(|(col, _)| *col)
                .collect::<Vec<_>>()
                .join(", "),
        },
        Dedup::Final,
    )
}

/// Which pairs a request reads.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Pairs {
    /// `hero-counter-stats`: players of opposing teams.
    Enemies,
    /// `hero-synergy-stats`: teammates.
    Allies,
}

/// The filters of a pair request the rollup's grain covers. Every other filter (per player,
/// account, build, duration, match id) needs `match_player`.
#[derive(Clone, Copy)]
pub(super) struct PairRequest<'a> {
    pub(super) pairs: Pairs,
    pub(super) game_mode: Option<GameMode>,
    pub(super) match_mode: Option<&'a [MatchMode]>,
    pub(super) min_unix_timestamp: Option<i64>,
    pub(super) max_unix_timestamp: Option<i64>,
    pub(super) min_average_badge: Option<u8>,
    pub(super) max_average_badge: Option<u8>,
    pub(super) same_lane: bool,
}

/// A parenthesized `FROM` source of the request's rollup rows (columns `hero_id`,
/// `other_hero_id` and [`AGG_MEASURES`]), or `None` when the match modes need rows the rollup
/// lacks or the window holds no whole day.
pub(super) fn pair_source(request: &PairRequest<'_>) -> Option<String> {
    if !MatchMode::is_agg_servable(request.match_mode) {
        return None;
    }
    let split = DaySplit::new(request.min_unix_timestamp, request.max_unix_timestamp)?;
    let mut filters = RollupFilters::new(
        request.game_mode,
        request.match_mode,
        request.min_average_badge,
        request.max_average_badge,
    );
    filters.rollup.push(match request.pairs {
        Pairs::Enemies => "enemy = 1".to_owned(),
        Pairs::Allies => "enemy = 0".to_owned(),
    });
    if request.same_lane {
        filters.rollup.push("same_lane = 1".to_owned());
    }
    Some(
        hero_pair_agg().source(&split, &filters, "hero_id, other_hero_id", |edge| {
            agg_rows(edge, Dedup::Newest)
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    #[test]
    fn rollup_rows_have_the_table_column_order() {
        let body = agg_select_body("TRUE");
        assert_valid_sql(&body);
        // Whole days dedup with FINAL, the cheaper of the two there.
        assert!(body.contains("FROM default.match_player FINAL\n        PREWHERE"));
        let outer = body.split("\nFROM (").next().expect("outer select");
        let columns = outer
            .split(",\n")
            .flat_map(|item| item.split(", "))
            .filter_map(|item| item.trim().rsplit_once(" AS "))
            .map(|(_, col)| col)
            .collect::<Vec<_>>();
        let expected = AGG_GRAIN
            .iter()
            .map(|(col, _)| *col)
            .chain(AGG_MEASURES.split(", "))
            .collect::<Vec<_>>();
        assert_eq!(columns, expected);
    }

    #[test]
    fn requests_read_their_kind_of_pairs() {
        let request = PairRequest {
            pairs: Pairs::Enemies,
            game_mode: Some(GameMode::Normal),
            match_mode: None,
            // 2026-10-05 14:00 UTC, open-ended.
            min_unix_timestamp: Some(1_791_208_800),
            max_unix_timestamp: None,
            min_average_badge: Some(91),
            max_average_badge: None,
            same_lane: true,
        };
        let source = pair_source(&request).expect("served");
        assert_valid_sql(&format!("SELECT sum(n_pairs) FROM {source}"));
        assert!(source.contains("FROM default.hero_pair_stats_agg WHERE game_mode = 1 AND least_badge >= 91 AND enemy = 1 AND same_lane = 1 AND day >= "));
        // The partial first day and the late matches come from match_player.
        assert!(source.contains("FROM default.match_player\n"));
        assert!(!source.contains("FINAL"));
        assert!(source.contains("ifNull(average_badge, 0) >= 91"));

        let allies = pair_source(&PairRequest {
            pairs: Pairs::Allies,
            same_lane: false,
            min_average_badge: None,
            ..request
        })
        .expect("served");
        assert!(allies.contains("enemy = 0"));
        assert!(!allies.contains("same_lane = 1"));
        assert!(!allies.contains("least_badge"));

        // No whole day, or a mode the rollup does not hold.
        assert!(
            pair_source(&PairRequest {
                min_unix_timestamp: Some(1_791_208_800),
                max_unix_timestamp: Some(1_791_208_800 + 3600),
                ..request
            })
            .is_none()
        );
        assert!(
            pair_source(&PairRequest {
                match_mode: Some(&[MatchMode::PrivateLobby]),
                ..request
            })
            .is_none()
        );
    }
}
