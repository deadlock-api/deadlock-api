export const Z_SCORE_WR_WEIGHT = 0.6;
export const Z_SCORE_PR_WEIGHT = 0.25;
export const Z_SCORE_BR_WEIGHT = 0.15;

/**
 * Computes z-score based tier score from arrays of hero winrates, pickrates,
 * and (optionally) banrates. When banrates are present on every hero, they are
 * folded in as a third standardized term using brWeight; otherwise the
 * winrate/pickrate weights are renormalized to sum to 1.
 *
 * z_wr = (wr - mean_wr) / stdev_wr
 * z_pr = (pr - mean_pr) / stdev_pr
 * z_br = (br - mean_br) / stdev_br
 * score = w1 * z_wr + w2 * z_pr + w3 * z_br
 */
export function computeZScores(
  heroes: { winrate: number; pickrate: number; banrate?: number }[],
  wrWeight: number = Z_SCORE_WR_WEIGHT,
  prWeight: number = Z_SCORE_PR_WEIGHT,
  brWeight: number = Z_SCORE_BR_WEIGHT,
): number[] {
  const n = heroes.length;
  if (n === 0) return [];

  const hasBan = heroes.every((h) => typeof h.banrate === "number");
  const wrW = hasBan ? wrWeight : wrWeight / (wrWeight + prWeight);
  const prW = hasBan ? prWeight : prWeight / (wrWeight + prWeight);
  const brW = hasBan ? brWeight : 0;

  const meanWr = heroes.reduce((s, h) => s + h.winrate, 0) / n;
  const meanPr = heroes.reduce((s, h) => s + h.pickrate, 0) / n;
  const meanBr = hasBan ? heroes.reduce((s, h) => s + (h.banrate ?? 0), 0) / n : 0;

  const stdevWr = Math.sqrt(heroes.reduce((s, h) => s + (h.winrate - meanWr) ** 2, 0) / n) || 1;
  const stdevPr = Math.sqrt(heroes.reduce((s, h) => s + (h.pickrate - meanPr) ** 2, 0) / n) || 1;
  const stdevBr = hasBan ? Math.sqrt(heroes.reduce((s, h) => s + ((h.banrate ?? 0) - meanBr) ** 2, 0) / n) || 1 : 1;

  return heroes.map((h) => {
    const zWr = (h.winrate - meanWr) / stdevWr;
    const zPr = (h.pickrate - meanPr) / stdevPr;
    const zBr = hasBan ? ((h.banrate ?? 0) - meanBr) / stdevBr : 0;
    return wrW * zWr + prW * zPr + brW * zBr;
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
 * in log(presence) space — where presence = pickrate + banrate when banrate is
 * available, falling back to pickrate alone otherwise. Heroes with more matches
 * get higher weight (sample-size weighting), and heroes closer in presence get
 * higher weight (LOESS kernel).
 *
 * Residual = actual_wr - expected_wr
 *
 * Positive residual = hero overperforms for how often they appear in the draft.
 * Negative residual = hero underperforms for how often they appear in the draft.
 *
 * @param bandwidth - LOESS bandwidth (0-1). Fraction of data used per local fit. Default 0.75.
 */

export function computeResiduals(
  heroes: { winrate: number; pickrate: number; banrate?: number; matches?: number }[],
  bandwidth = 0.75,
): { residuals: number[]; expectedWinrates: number[] } {
  const n = heroes.length;
  if (n === 0) return { residuals: [], expectedWinrates: [] };

  const hasBan = heroes.every((h) => typeof h.banrate === "number");
  // Log-transform presence (pickrate + banrate) when available, else pickrate alone
  const x = heroes.map((h) => Math.log(Math.max(h.pickrate + (hasBan ? (h.banrate ?? 0) : 0), 1e-10)));
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
