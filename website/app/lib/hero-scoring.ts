export const Z_SCORE_WR_WEIGHT = 0.65;
export const Z_SCORE_PR_WEIGHT = 0.35;

/**
 * Computes z-score based tier score from arrays of hero winrates and pickrates.
 * Returns a map from index to the combined z-score.
 *
 * z_wr = (wr - mean_wr) / stdev_wr
 * z_pr = (pr - mean_pr) / stdev_pr
 * score = w1 * z_wr + w2 * z_pr
 */
export function computeZScores(
  heroes: { winrate: number; pickrate: number }[],
  wrWeight: number = Z_SCORE_WR_WEIGHT,
  prWeight: number = Z_SCORE_PR_WEIGHT,
): number[] {
  const n = heroes.length;
  if (n === 0) return [];

  const meanWr = heroes.reduce((s, h) => s + h.winrate, 0) / n;
  const meanPr = heroes.reduce((s, h) => s + h.pickrate, 0) / n;

  const stdevWr = Math.sqrt(heroes.reduce((s, h) => s + (h.winrate - meanWr) ** 2, 0) / n) || 1;
  const stdevPr = Math.sqrt(heroes.reduce((s, h) => s + (h.pickrate - meanPr) ** 2, 0) / n) || 1;

  return heroes.map((h) => {
    const zWr = (h.winrate - meanWr) / stdevWr;
    const zPr = (h.pickrate - meanPr) / stdevPr;
    return wrWeight * zWr + prWeight * zPr;
  });
}

/**
 * Tricube kernel for LOESS weighting.
 * Returns (1 - |u|^3)^3 for |u| < 1, else 0.
 */
function tricube(u: number): number {
  const abs = Math.abs(u);
  if (abs >= 1) return 0;
  const t = 1 - abs * abs * abs;
  return t * t * t;
}

/**
 * Computes expected winrate residuals using LOESS (locally weighted regression).
 *
 * For each hero, fits a local weighted linear regression using nearby heroes
 * in log(pickrate) space. Heroes with more matches get higher weight (sample-size
 * weighting), and heroes closer in pickrate get higher weight (LOESS kernel).
 *
 * Residual = actual_wr - expected_wr
 *
 * Positive residual = hero overperforms for their popularity.
 * Negative residual = hero underperforms for their popularity.
 *
 * @param bandwidth - LOESS bandwidth (0-1). Fraction of data used per local fit. Default 0.75.
 */

export function computeResiduals(
  heroes: { winrate: number; pickrate: number; matches?: number }[],
  bandwidth = 0.75,
): { residuals: number[]; expectedWinrates: number[] } {
  const n = heroes.length;
  if (n === 0) return { residuals: [], expectedWinrates: [] };

  // Log-transform pickrate
  const x = heroes.map((h) => Math.log(Math.max(h.pickrate, 1e-10)));
  const y = heroes.map((h) => h.winrate);

  // Sample-size weights (sqrt of matches, normalized to mean=1)
  const rawWeights = heroes.map((h) => Math.sqrt(h.matches ?? 1));
  const meanWeight = rawWeights.reduce((s, w) => s + w, 0) / n;
  const sampleWeights = rawWeights.map((w) => w / meanWeight);

  // Number of neighbors to use per local fit
  const k = Math.max(3, Math.ceil(bandwidth * n));

  const expectedWinrates: number[] = [];

  for (let i = 0; i < n; i++) {
    const xi = x[i];

    // Compute distances and find the k-th nearest distance for the kernel width
    const distances = x.map((xj) => Math.abs(xj - xi));
    const sortedDist = [...distances].sort((a, b) => a - b);
    const maxDist = sortedDist[k - 1] || sortedDist[sortedDist.length - 1] || 1;

    // Combined weight = tricube kernel * sample-size weight
    const w = distances.map((d, j) => tricube(d / (maxDist * 1.001)) * sampleWeights[j]);

    // Weighted least squares: y = a + b*x
    const sumW = w.reduce((s, wi) => s + wi, 0) || 1;
    const wmX = w.reduce((s, wi, j) => s + wi * x[j], 0) / sumW;
    const wmY = w.reduce((s, wi, j) => s + wi * y[j], 0) / sumW;

    let ssXX = 0;
    let ssXY = 0;
    for (let j = 0; j < n; j++) {
      const dx = x[j] - wmX;
      ssXX += w[j] * dx * dx;
      ssXY += w[j] * dx * (y[j] - wmY);
    }

    const slope = ssXX !== 0 ? ssXY / ssXX : 0;
    const intercept = wmY - slope * wmX;
    expectedWinrates.push(intercept + slope * xi);
  }

  const residuals = heroes.map((h, i) => h.winrate - expectedWinrates[i]);

  return { residuals, expectedWinrates };
}
