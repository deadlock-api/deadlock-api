interface GaussianStats {
  avg?: number | null;
  std?: number | null;
}

function validMean(stats: GaussianStats | undefined): number | null {
  return stats?.avg != null && Number.isFinite(stats.avg) ? stats.avg : null;
}

function validSpread(stats: GaussianStats | undefined): number | null {
  return stats?.std != null && Number.isFinite(stats.std) && stats.std > 0 ? stats.std : null;
}

/** Fits normal densities to API moments; these are approximations, not measured distributions. */
export function buildGaussianComparison(player?: GaussianStats, cohort?: GaussianStats, maximum = Infinity) {
  const means = [validMean(player), validMean(cohort)];
  const spreads = [validSpread(player), validSpread(cohort)];
  const present = means.filter((mean): mean is number => mean !== null);
  if (!present.length) return null;

  const extents = means.flatMap((mean, index) => {
    if (mean === null) return [];
    const padding = spreads[index] != null ? 4 * spreads[index] : Math.max(Math.abs(mean) * 0.1, 0.5);
    return [mean - padding, mean + padding];
  });
  const min = Math.max(0, Math.min(...extents));
  const max = Math.min(maximum, Math.max(...extents));
  if (!(max > min)) return null;

  // Sample each curve separately so a narrow distribution retains its shape beside a wide one.
  const coordinates = new Set<number>([min, max]);
  for (let index = 0; index < means.length; index++) {
    const mean = means[index];
    const spread = spreads[index];
    if (mean === null) continue;
    if (mean >= min && mean <= max) coordinates.add(mean);
    if (spread === null) continue;
    const start = Math.max(min, mean - 4 * spread);
    const end = Math.min(max, mean + 4 * spread);
    for (let i = 0; i <= 80; i++) coordinates.add(start + ((end - start) * i) / 80);
  }
  const density = (x: number, index: number) => {
    const mean = means[index];
    const spread = spreads[index];
    // Zero variance is a point mass; show its mean marker instead of inventing a bell curve.
    if (mean === null || spread === null) return null;
    return Math.exp(-0.5 * ((x - mean) / spread) ** 2) / (spread * Math.sqrt(2 * Math.PI));
  };
  return {
    min,
    max,
    hasSpread: means.some((mean, index) => mean !== null && spreads[index] !== null),
    points: [...coordinates].sort((a, b) => a - b).map((x) => ({ x, player: density(x, 0), cohort: density(x, 1) })),
  };
}
