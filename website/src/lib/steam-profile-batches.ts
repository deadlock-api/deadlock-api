const STEAM_BATCH_SIZE = 500;

/** Equivalent account sets share cache keys, regardless of their display order. */
export function steamProfileBatches(accountIds: number[]): number[][] {
  const uniqueIds = [...new Set(accountIds.filter((id) => Number.isSafeInteger(id) && id > 0))].sort((a, b) => a - b);
  const batches: number[][] = [];
  for (let i = 0; i < uniqueIds.length; i += STEAM_BATCH_SIZE) {
    batches.push(uniqueIds.slice(i, i + STEAM_BATCH_SIZE));
  }
  return batches;
}
