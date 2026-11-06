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
/// `db/clickhouse/_functions/rank*.sql`, so every query reads them the same way:
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

#[cfg(test)]
mod tests {
    use super::*;

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
