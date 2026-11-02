//! Rank badges: Valve's badge ids (tier × 10 + subtier, 11–116), their contiguous index, and how
//! a badge follows from the flat rank progress, in Rust and as `ClickHouse` expressions.

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

/// Progress at which Eternus I starts. Progress keeps accumulating past it without a ceiling.
pub(crate) const ETERNUS_PROGRESS: u32 = 70_000;

/// Convert Valve's flat rank progress to a badge ID.
///
/// Below Eternus, progress is a ladder-wide counter in fixed 1000-point steps, seven per tier,
/// with the sixth subtier spanning two of them. Eternus subranks are percentile cuts Valve
/// recomputes daily, so progress alone can't place a player within Eternus: the division comes
/// from `initial_display_rank`, the badge the player entered the match with, and is at least
/// Eternus I in case the match promoted them into it.
pub(crate) fn badge_from_flat_progress(flat_progress: u32, initial_display_rank: u32) -> u32 {
    if flat_progress >= ETERNUS_PROGRESS {
        return initial_display_rank.max(ETERNUS_MIN_BADGE);
    }
    let idx = flat_progress / 1000;
    (idx / 7)
        .saturating_add(1)
        .saturating_mul(10)
        .saturating_add((idx % 7).saturating_add(1).min(6))
}

/// Progress into the current subrank and the width of that subrank, both in progress points.
///
/// The sixth subtier spans two of the 1000-point steps, so it is 2000 wide.
pub(crate) const fn subrank_progress(flat_progress: u32) -> (u32, u32) {
    let step = flat_progress / 1000 % 7;
    let progress = (flat_progress % 1000).saturating_add(if step == 6 { 1000 } else { 0 });
    let width = if step >= 5 { 2000 } else { 1000 };
    (progress, width)
}

/// `ClickHouse` expression equivalent to [`badge_from_flat_progress`]. Both arguments must be
/// non-nullable numeric expressions; `flat_progress` is inlined three times.
pub(crate) fn badge_from_flat_progress_sql(
    flat_progress: &str,
    initial_display_rank: &str,
) -> String {
    format!(
        "toUInt32(if({flat_progress} >= {ETERNUS_PROGRESS}, greatest({ETERNUS_MIN_BADGE}, {initial_display_rank}), \
         (intDiv(intDiv({flat_progress}, 1000), 7) + 1) * 10 + least(intDiv({flat_progress}, 1000) % 7 + 1, 6)))"
    )
}

/// `ClickHouse` expression for the progress half of [`subrank_progress`], `NULL` in Eternus where
/// subranks are percentile cuts rather than point spans. `flat_progress` must be a non-nullable
/// numeric expression and is inlined three times.
pub(crate) fn subrank_progress_sql(flat_progress: &str) -> String {
    format!(
        "if({flat_progress} >= {ETERNUS_PROGRESS}, NULL, toUInt32({flat_progress} % 1000 + \
         if(intDiv({flat_progress}, 1000) % 7 = 6, 1000, 0)))"
    )
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
    fn test_badge_from_flat_progress() {
        // Subtier 6 spans two 1000-point steps, so each tier covers seven of them.
        for (progress, expected) in [
            (0, 11),
            (999, 11),
            (1_000, 12),
            (4_000, 15),
            (5_000, 16),
            (6_975, 16),
            (7_000, 21),
            (35_000, 61),
            (53_225, 85),
            (69_999, 106),
        ] {
            assert_eq!(
                badge_from_flat_progress(progress, 84),
                expected,
                "{progress}"
            );
        }
    }

    #[test]
    fn test_badge_in_eternus_comes_from_the_initial_display_rank() {
        // Promoted into Eternus by this match: the initial badge is still Ascendant VI.
        assert_eq!(badge_from_flat_progress(70_000, 106), 111);
        assert_eq!(badge_from_flat_progress(84_830, 112), 112);
        assert_eq!(badge_from_flat_progress(84_830, 116), 116);
    }

    #[test]
    fn test_subrank_progress() {
        for (progress, expected) in [
            (0, (0, 1000)),
            (250, (250, 1000)),
            (4_600, (600, 1000)),
            // Subtier 6 spans 5_000..7_000.
            (5_000, (0, 2000)),
            (6_400, (1_400, 2000)),
            (7_000, (0, 1000)),
            (53_225, (225, 1000)),
        ] {
            assert_eq!(subrank_progress(progress), expected, "{progress}");
        }
    }

    #[test]
    fn test_badge_idx_roundtrip() {
        for idx in 1..=66 {
            let badge = idx_to_badge(idx);
            assert_eq!(badge_to_idx(badge), idx);
        }
    }
}
