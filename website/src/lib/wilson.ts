/**
 * Wilson score interval for a binomial proportion (e.g. win rate). Returns `[low, high]` bounds in
 * [0,1]. `z` defaults to 1.96 (95% confidence). Far more reliable than the normal approximation for
 * small samples, which is exactly where build-path win rates land.
 */
export function wilsonScoreInterval(wins: number, matches: number, z = 1.96): [number, number] {
  // No games say nothing about the rate: the whole range, not a certain 0% that confidence filters took as "high".
  if (matches === 0) return [0, 1];

  const phat = wins / matches;
  const zSquared = z * z;
  const zSquaredOverMatches = zSquared / matches;
  const denominator = 1 + zSquaredOverMatches;

  const center = phat + zSquaredOverMatches * 0.5;
  const margin = z * Math.sqrt((phat * (1 - phat) + zSquaredOverMatches * 0.25) / matches);

  return [(center - margin) / denominator, (center + margin) / denominator];
}
