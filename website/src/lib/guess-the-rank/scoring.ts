import { guessDayNumber, guessShareUrl, ROUNDS_PER_DAY } from "./daily";

// Points for a guess: the rank tier is what is guessed, the subtier is only shown. The tiers, their names and badges
// come from the assets API (/v1/assets/ranks); every ranked tier (tier > 0) can be guessed. A guess scores by how many
// tiers it is off: the right tier 3 points, one off 2, two off 1, further 0. Three rounds make 9.

const POINTS_BY_DISTANCE = [3, 2, 1] as const;

export const MAX_ROUND_POINTS = POINTS_BY_DISTANCE[0];
export const MAX_DAY_POINTS = MAX_ROUND_POINTS * ROUNDS_PER_DAY;

/** The tier of a badge (tier * 10 + subtier): badge 74 is tier 7. */
export function tierOfBadge(badge: number): number {
  return Math.floor(badge / 10);
}

/** The subtier of a badge, 1 to 6: badge 74 is subtier 4. */
export function subtierOfBadge(badge: number): number {
  return badge % 10;
}

/** The tiers a player can guess: every ranked tier of the assets API's ranks (Obscurus, tier 0, is unranked). */
export function guessableTiers(ranks: readonly { tier: number }[]): number[] {
  return ranks
    .map((rank) => rank.tier)
    .filter((tier) => tier > 0)
    .toSorted((a, b) => a - b);
}

/** How many tiers a guess is off. */
export function tierDistance(guess: number, actual: number): number {
  return Math.abs(guess - actual);
}

/** The points a guess of `guess` earns when the player was in `actual`. */
export function roundPoints(guess: number, actual: number): number {
  return POINTS_BY_DISTANCE[tierDistance(guess, actual)] ?? 0;
}

/** How a round reads: "Exact", "1 tier off". */
export function distanceLabel(distance: number): string {
  if (distance === 0) return "Exact";
  return `${distance} ${distance === 1 ? "tier" : "tiers"} off`;
}

/** A round in the share text: green exact, yellow one off, orange two off, red further. */
export function distanceEmoji(distance: number): string {
  if (distance === 0) return "\u{1f7e9}";
  if (distance === 1) return "\u{1f7e8}";
  if (distance === 2) return "\u{1f7e7}";
  return "\u{1f7e5}";
}

/** How a day's score reads. */
export function scoreGrade(points: number, max: number): "good" | "fair" | "poor" {
  if (points >= max * (2 / 3)) return "good";
  if (points >= max / 3) return "fair";
  return "poor";
}

/** "Guess the Rank #3 7/9", a square per round, and the link. */
export function guessShareText(date: string, rounds: readonly { guess: number; actual: number }[]): string {
  const points = rounds.reduce((sum, { guess, actual }) => sum + roundPoints(guess, actual), 0);
  const max = rounds.length * MAX_ROUND_POINTS;
  const grid = rounds.map(({ guess, actual }) => distanceEmoji(tierDistance(guess, actual))).join("");
  return `Guess the Rank #${guessDayNumber(date)} ${points}/${max}\n${grid}\n${guessShareUrl(date)}`;
}
