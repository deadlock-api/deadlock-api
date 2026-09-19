interface WinRecord {
  wins: number;
  matches: number;
}

/** Difference in win probability; allies use the mean of both heroes' baselines. */
export function matchupWinRateChange(
  wins: number,
  matches: number,
  baselines: (WinRecord | undefined)[],
): number | undefined {
  const valid = (record: WinRecord | undefined): record is WinRecord =>
    record !== undefined &&
    Number.isFinite(record.matches) &&
    Number.isFinite(record.wins) &&
    record.matches > 0 &&
    record.wins >= 0 &&
    record.wins <= record.matches;

  if (!valid({ wins, matches }) || baselines.length === 0 || !baselines.every(valid)) return undefined;
  return wins / matches - baselines.reduce((sum, hero) => sum + hero.wins / hero.matches, 0) / baselines.length;
}
