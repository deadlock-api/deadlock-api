/** The analytics endpoint accepts lobby badges through 116 (all six subtiers of tier 11). */
export function benchmarkRankRange(badge: number | null | undefined) {
  if (badge == null || !Number.isInteger(badge) || badge < 11 || badge > 116) return null;
  const tier = Math.floor(badge / 10);
  if (badge % 10 < 1 || badge % 10 > 6) return null;
  return { tier, min: tier * 10 + 1, max: tier * 10 + 6 };
}

/** Missing/nonfinite API values are unavailable, never zero; a zero baseline has no percentage delta. */
export function compareBenchmark(player: number | null | undefined, cohort: number | null | undefined) {
  if (player == null || cohort == null || !Number.isFinite(player) || !Number.isFinite(cohort)) return null;
  return {
    player,
    cohort,
    delta: player - cohort,
    relativeDelta: cohort === 0 ? null : (player - cohort) / Math.abs(cohort),
  };
}
