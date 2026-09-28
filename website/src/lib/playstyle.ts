import type { HashMapValue } from "deadlock_api_client";

import { approxPercentile } from "~/lib/distribution-percentile";
import { LOWER_IS_BETTER_METRICS } from "~/lib/player-compare";

/** One side of a player's game, each measured by one stat of the player metrics endpoint. */
export type PlaystyleAxis =
  | "fighting"
  | "kills"
  | "survival"
  | "teamplay"
  | "farming"
  | "objectives"
  | "healing"
  | "accuracy";

export interface PlaystyleAxisDefinition {
  axis: PlaystyleAxis;
  /** The short name on the radar. */
  label: string;
  /** The stat behind it, a key of `PLAYER_METRICS`. */
  metricKey: string;
}

/** The radar's axes, clockwise from the top: combat on the right, economy and the map at the bottom, team on the left. */
export const PLAYSTYLE_AXES: readonly PlaystyleAxisDefinition[] = [
  { axis: "fighting", label: "Damage", metricKey: "player_damage_per_min" },
  { axis: "kills", label: "Kills", metricKey: "kills" },
  { axis: "accuracy", label: "Accuracy", metricKey: "accuracy" },
  { axis: "farming", label: "Farming", metricKey: "net_worth_per_min" },
  { axis: "objectives", label: "Objectives", metricKey: "boss_damage_per_min" },
  { axis: "survival", label: "Survival", metricKey: "deaths" },
  { axis: "healing", label: "Healing", metricKey: "player_healing_per_min" },
  { axis: "teamplay", label: "Teamplay", metricKey: "assists" },
];

/**
 * Where a player stands on each axis among all players on the same filters, 0-100 with 50 the median, turned so
 * that higher is always better (fewer deaths ranks high on Survival). An axis without data on either side is left
 * out.
 */
export type PlaystylePercentiles = Partial<Record<PlaystyleAxis, number>>;

export function playstylePercentiles(
  population: Record<string, HashMapValue> | undefined,
  own: Record<string, HashMapValue> | undefined,
): PlaystylePercentiles {
  const result: PlaystylePercentiles = {};
  if (!population || !own) return result;
  for (const { axis, metricKey } of PLAYSTYLE_AXES) {
    const values = population[metricKey];
    const avg = own[metricKey]?.avg;
    if (!values || avg == null || !Number.isFinite(avg)) continue;
    const atOrBelow = approxPercentile(values, avg);
    result[axis] = LOWER_IS_BETTER_METRICS.has(metricKey) ? 100 - atOrBelow : atOrBelow;
  }
  return result;
}

export type PlaystyleId =
  | "brawler"
  | "slayer"
  | "sharpshooter"
  | "farmer"
  | "objective"
  | "survivor"
  | "support"
  | "team-player"
  | "all-rounder";

export interface Playstyle {
  id: PlaystyleId;
  /** What a reader calls it: "Farmer", "Objective focused". */
  label: string;
  /** The axes that earned the label, strongest first; empty for an all-rounder. */
  strengths: PlaystyleAxis[];
}

const STYLE_BY_AXIS: Record<PlaystyleAxis, { id: PlaystyleId; label: string }> = {
  fighting: { id: "brawler", label: "Brawler" },
  kills: { id: "slayer", label: "Slayer" },
  accuracy: { id: "sharpshooter", label: "Sharpshooter" },
  farming: { id: "farmer", label: "Farmer" },
  objectives: { id: "objective", label: "Objective focused" },
  survival: { id: "survivor", label: "Survivor" },
  healing: { id: "support", label: "Support" },
  teamplay: { id: "team-player", label: "Team player" },
};

/** Fewer known axes than this and a label would say more than the data does. */
const MIN_AXES = 4;
/** A strength ranks at least this high among all players... */
const STRENGTH_FLOOR = 60;
/** ...and this far above the player's own average, so a player good at everything is not named after noise. */
const STRENGTH_MARGIN = 8;
/** Two strengths this close are read as one style: damage and kills together make a brawler. */
const PAIR_MARGIN = 5;

/**
 * A short name for how a player plays, from their strongest axes: "Farmer" for a player whose net worth stands out,
 * "All-rounder" for one with no side clearly above the rest. `null` with too few axes to say.
 */
export function playstyleLabel(percentiles: PlaystylePercentiles): Playstyle | null {
  const known = PLAYSTYLE_AXES.flatMap(({ axis }) => {
    const value = percentiles[axis];
    return value == null || !Number.isFinite(value) ? [] : [{ axis, value }];
  });
  if (known.length < MIN_AXES) return null;

  const mean = known.reduce((sum, { value }) => sum + value, 0) / known.length;
  // Strongest first; a tie keeps the axes' own order, so the result does not depend on the input's key order.
  const strengths = known
    .filter(({ value }) => value >= STRENGTH_FLOOR && value - mean >= STRENGTH_MARGIN)
    .sort((a, b) => b.value - a.value);
  if (strengths.length === 0) return { id: "all-rounder", label: "All-rounder", strengths: [] };

  const [top, second] = strengths;
  const close = second && top.value - second.value <= PAIR_MARGIN ? second : undefined;
  if (close) {
    // Pairs that read as one style of their own.
    const pair = new Set([top.axis, close.axis]);
    const both = [top.axis, close.axis];
    if (pair.has("fighting") && pair.has("kills")) return { id: "brawler", label: "Brawler", strengths: both };
    if (pair.has("healing") && pair.has("teamplay")) return { id: "support", label: "Support", strengths: both };
  }
  return { ...STYLE_BY_AXIS[top.axis], strengths: strengths.slice(0, 2).map(({ axis }) => axis) };
}
