/**
 * The item stats request fields for "against these heroes": matches with every one of them on the other team, so "best
 * items against Mina and Bebop" means both, not either.
 */
export function enemyHeroFilter(enemies: readonly number[]): { enemyHeroIds?: string; enemyHeroIdsAllMatch?: boolean } {
  if (enemies.length === 0) return {};
  return { enemyHeroIds: enemies.join(","), enemyHeroIdsAllMatch: enemies.length > 1 || undefined };
}

/** The `enemy` URL parameter as the router parses it: one id is a number, several a comma separated string. */
export function parseEnemyParam(value: unknown): number[] {
  if (typeof value === "number") return Number.isInteger(value) ? [value] : [];
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
}
