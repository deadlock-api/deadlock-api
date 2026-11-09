//! Rank badges: Valve's badge ids (tier × 10 + subtier, 11–116), their contiguous index, and the
//! `ClickHouse` expressions that turn flat rank progress into a badge.

/// Eternus I, the first badge whose subranks are percentile cuts rather than point spans.
pub(crate) const ETERNUS_MIN_BADGE: u32 = 111;

/// Convert a raw badge value (11–116) to a 1-based contiguous index (1–66).
///
/// Formula: `(badge / 10 - 1) * 6 + badge % 10`
/// e.g. badge 82 → (8-1)*6 + 2 = 44
pub(crate) const fn badge_to_idx(badge: i32) -> i32 {
    (badge / 10)
        .saturating_sub(1)
        .saturating_mul(6)
        .saturating_add(badge % 10)
}

/// Convert a badge index (1..=66) back to a badge ID.
///
/// Tiers 1–11, 6 sub-ranks each. Index 1 → badge 11, index 66 → badge 116.
/// Out-of-range values are clamped.
pub(crate) fn idx_to_badge(idx: i32) -> i32 {
    let idx = idx.clamp(1, 66);
    let zero_based = idx.saturating_sub(1);
    (zero_based / 6)
        .saturating_mul(10)
        .saturating_add(11)
        .saturating_add(zero_based % 6)
}

/// The ladder that turns flat rank progress into a badge depends on the ranked interval: a tier
/// spans the sum of the interval's `sub_rank_xp` (7000 in interval 1, 6500 in interval 2) and
/// Eternus starts after 10 tiers, where subranks are percentile cuts that only the display rank
/// knows. The ladders come from the game files (`default.ranked_season_intervals`, filled by the
/// update-assets-tables worker) and are applied in SQL by the functions in
/// `db/clickhouse/_functions/rank*.sql`, so every query reads them the same way (the rank lookup
/// mirrors them in Rust, see [`ladder_rank`]; change both together):
///
/// - `rankBadge(flat_progress, display_rank, rank_interval)`: the badge, in Eternus the larger of
///   Eternus I and `display_rank`.
/// - `rankSubrankProgress(flat_progress, rank_interval)`: progress into the subrank, in Eternus the
///   points past its start.
/// - `rankSubrankWidth(flat_progress, rank_interval)`: the subrank's width, `NULL` in Eternus.
///
/// A `NULL` interval reads as interval 1, the only one before `rank_interval` was recorded.
/// Arguments must be non-nullable apart from `rank_interval`.
pub(crate) fn rank_badge_sql(
    flat_progress: &str,
    display_rank: &str,
    rank_interval: &str,
) -> String {
    format!("rankBadge({flat_progress}, {display_rank}, {rank_interval})")
}

/// Progress into the subrank of [`rank_badge_sql`], in Eternus the points past its start.
pub(crate) fn rank_subrank_progress_sql(flat_progress: &str, rank_interval: &str) -> String {
    format!("rankSubrankProgress({flat_progress}, {rank_interval})")
}

/// Width of the subrank of [`rank_badge_sql`], `NULL` in Eternus.
pub(crate) fn rank_subrank_width_sql(flat_progress: &str, rank_interval: &str) -> String {
    format!("rankSubrankWidth({flat_progress}, {rank_interval})")
}

/// A position on a ranked interval's ladder, see [`ladder_rank`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct LadderRank {
    /// The badge, as `rankBadge`.
    pub(crate) badge: u32,
    /// Progress into the subrank and its width, as `rankSubrankProgress` and `rankSubrankWidth`.
    /// `None` in Eternus, where subranks are percentile cuts rather than point spans.
    pub(crate) progress: Option<(u32, u32)>,
}

/// The Rust copy of `rankBadge`, `rankSubrankProgress` and `rankSubrankWidth` (see
/// [`rank_badge_sql`]), for `sub_rank_xp` read with `rankSubrankXp(rank_interval)`. The SQL
/// functions stay the source of truth; this copy exists because the expanded functions cost
/// ~30 ms of query planning per rank lookup, more than the lookup's read. The tests check it
/// against values the SQL functions returned (on 2026-11-09 also a 240k-point grid over both
/// ladders and display ranks 0, 50, 111 and 116).
///
/// An empty ladder, where the SQL functions would divide by zero, gives `display_rank` and no
/// progress.
pub(crate) fn ladder_rank(
    flat_progress: u32,
    display_rank: u32,
    sub_rank_xp: &[u32],
) -> LadderRank {
    let tier_xp = sub_rank_xp
        .iter()
        .fold(0_u32, |sum, &xp| sum.saturating_add(xp));
    let (Some(tier), Some(into_tier)) = (
        flat_progress.checked_div(tier_xp),
        flat_progress.checked_rem(tier_xp),
    ) else {
        return LadderRank {
            badge: display_rank,
            progress: None,
        };
    };
    // Eternus starts after 10 tiers: `flat_progress >= 10 * tier_xp`.
    if tier >= 10 {
        return LadderRank {
            badge: display_rank.max(ETERNUS_MIN_BADGE),
            progress: None,
        };
    }
    // The subrank is the number of subrank starts at or below the progress into the tier, so the
    // last subrank that starts at or below it.
    let mut start = 0_u32;
    let (mut subrank, mut subrank_start, mut width) = (0_u32, 0_u32, 0_u32);
    for &xp in sub_rank_xp {
        if start <= into_tier {
            subrank = subrank.saturating_add(1);
            subrank_start = start;
            width = xp;
        }
        start = start.saturating_add(xp);
    }
    LadderRank {
        badge: tier
            .saturating_add(1)
            .saturating_mul(10)
            .saturating_add(subrank),
        progress: Some((into_tier.saturating_sub(subrank_start), width)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Values `rankBadge`, `rankSubrankProgress` and `rankSubrankWidth` returned in prod on
    /// 2026-11-09 for display rank 114: (interval, flat progress, badge, (progress, width)).
    #[test]
    fn test_ladder_rank_matches_the_sql_functions() {
        type Case = (u32, u32, u32, Option<(u32, u32)>);
        const INTERVAL_1: [u32; 6] = [1000, 1000, 1000, 1000, 1000, 2000];
        const INTERVAL_2: [u32; 6] = [1000, 1000, 1000, 1000, 1000, 1500];
        let cases: [Case; 34] = [
            (1, 0, 11, Some((0, 1000))),
            (1, 999, 11, Some((999, 1000))),
            (1, 1000, 12, Some((0, 1000))),
            (1, 4999, 15, Some((999, 1000))),
            (1, 5000, 16, Some((0, 2000))),
            (1, 5999, 16, Some((999, 2000))),
            (1, 6000, 16, Some((1000, 2000))),
            (1, 6499, 16, Some((1499, 2000))),
            (1, 6500, 16, Some((1500, 2000))),
            (1, 6999, 16, Some((1999, 2000))),
            (1, 7000, 21, Some((0, 1000))),
            (1, 13000, 26, Some((1000, 2000))),
            (1, 64999, 102, Some((999, 1000))),
            (1, 65000, 103, Some((0, 1000))),
            (1, 69999, 106, Some((1999, 2000))),
            (1, 70000, 114, None),
            (1, 123456, 114, None),
            (2, 0, 11, Some((0, 1000))),
            (2, 999, 11, Some((999, 1000))),
            (2, 1000, 12, Some((0, 1000))),
            (2, 4999, 15, Some((999, 1000))),
            (2, 5000, 16, Some((0, 1500))),
            (2, 5999, 16, Some((999, 1500))),
            (2, 6000, 16, Some((1000, 1500))),
            (2, 6499, 16, Some((1499, 1500))),
            (2, 6500, 21, Some((0, 1000))),
            (2, 6999, 21, Some((499, 1000))),
            (2, 7000, 21, Some((500, 1000))),
            (2, 13000, 31, Some((0, 1000))),
            (2, 64999, 106, Some((1499, 1500))),
            (2, 65000, 114, None),
            (2, 69999, 114, None),
            (2, 70000, 114, None),
            (2, 123456, 114, None),
        ];
        for (interval, flat_progress, badge, progress) in cases {
            let xp = if interval == 1 {
                &INTERVAL_1
            } else {
                &INTERVAL_2
            };
            assert_eq!(
                ladder_rank(flat_progress, 114, xp),
                LadderRank { badge, progress },
                "interval {interval}, progress {flat_progress}"
            );
        }
    }

    #[test]
    fn test_ladder_rank_eternus_is_at_least_eternus_i() {
        let xp = [1000, 1000, 1000, 1000, 1000, 1500];
        assert_eq!(ladder_rank(65_000, 50, &xp).badge, ETERNUS_MIN_BADGE);
        assert_eq!(ladder_rank(65_000, 116, &xp).badge, 116);
    }

    #[test]
    fn test_ladder_rank_without_a_ladder_keeps_the_display_rank() {
        assert_eq!(
            ladder_rank(5_000, 42, &[]),
            LadderRank {
                badge: 42,
                progress: None
            }
        );
    }

    #[test]
    fn test_idx_to_badge_boundaries() {
        assert_eq!(idx_to_badge(1), 11);
        assert_eq!(idx_to_badge(6), 16);
        assert_eq!(idx_to_badge(7), 21);
        assert_eq!(idx_to_badge(66), 116);
        assert_eq!(idx_to_badge(0), 11);
        assert_eq!(idx_to_badge(67), 116);
    }

    #[test]
    fn test_badge_to_idx() {
        assert_eq!(badge_to_idx(11), 1);
        assert_eq!(badge_to_idx(16), 6);
        assert_eq!(badge_to_idx(21), 7);
        assert_eq!(badge_to_idx(82), 44);
        assert_eq!(badge_to_idx(116), 66);
    }

    #[test]
    fn test_badge_idx_roundtrip() {
        for idx in 1..=66 {
            let badge = idx_to_badge(idx);
            assert_eq!(badge_to_idx(badge), idx);
        }
    }
}
