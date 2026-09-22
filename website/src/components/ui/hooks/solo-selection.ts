/**
 * Next value of a multi-select filter whose default is "everything selected". While every choice is on, pressing one
 * keeps only that choice: "Tier 3" means "only tier 3", not "everything but tier 3". Otherwise pressing toggles as
 * usual, and releasing the last choice turns every choice back on, so the filter never shows nothing.
 */
export function soloSelection<T>(all: readonly T[], previous: readonly T[], next: readonly T[]): T[] {
  const allWereOn = all.every((choice) => previous.includes(choice));
  if (allWereOn && next.length === all.length - 1) {
    const released = all.find((choice) => !next.includes(choice));
    if (released !== undefined) return [released];
  }
  if (next.length === 0) return [...all];
  return all.filter((choice) => next.includes(choice));
}
