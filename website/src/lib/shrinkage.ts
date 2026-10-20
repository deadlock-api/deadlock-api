/**
 * Win rate pulled toward `priorRate` (50% unless given) as if `priorMatches` matches at that rate
 * had been played on top of the real ones. A handful of lucky games then can't outrank a
 * combination proven over thousands, which the Wilson lower bound alone still allows at extreme rates.
 */
export function shrunkWinRate(wins: number, matches: number, priorMatches = 100, priorRate = 0.5): number {
  return (wins + priorMatches * priorRate) / (matches + priorMatches);
}
