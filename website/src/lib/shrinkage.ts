/**
 * Win rate pulled toward 50% as if `priorMatches` even matches had been played on top of the
 * real ones. A handful of lucky games then can't outrank a combination proven over thousands,
 * which the Wilson lower bound alone still allows at extreme rates.
 */
export function shrunkWinRate(wins: number, matches: number, priorMatches = 100): number {
  return (wins + priorMatches / 2) / (matches + priorMatches);
}
