import type { AnalyticsBuffStats, MiscEntity } from "deadlock_api_client";

import type { Color } from "~/types/general";

/**
 * The "City Never Sleeps" update (build 6712, 2026-09-29 20:50 UTC). Pickup counts reach back through every match, but
 * pickup times and stat values are only recorded from here on: before it a timing is missing, not zero.
 */
export const BUFF_TIMINGS_SINCE = 1_790_715_000;

/** Why a buff timing is missing, for the screen reader behind a dash and for the notes beside the tables. */
export const BUFF_TIMINGS_NOTE = "Pickup times are recorded since the City Never Sleeps update (September 29, 2026).";

/** A buff type without its level: `spirit_permanent_pickup_lv2` is `spirit_permanent_pickup`, level 2. */
export function parseBuffType(buffType: string): { stat: string; level: number } {
  const match = /^(.*)_lv(\d+)$/.exec(buffType);
  return match ? { stat: match[1], level: Number(match[2]) } : { stat: buffType, level: 1 };
}

/** The game's meters are 39.37 units (inches). */
const UNITS_PER_METER = 39.37;

/** A stat value in the buff's unit: `Percent` values are percent points, `Meters` values game units. */
export function formatBuffValue(value: number, unit: string | null | undefined): string {
  if (unit === "Meters") return `${(value / UNITS_PER_METER).toLocaleString("en-US", { maximumFractionDigits: 2 })} m`;
  const text = value.toLocaleString("en-US", { maximumFractionDigits: value >= 100 ? 0 : 2 });
  return unit === "Percent" ? `${text}%` : text;
}

/** What the site shows of a pickup entity from `/v1/assets/misc-entities`. */
export interface BuffInfo {
  /** Localized label of the pickup, e.g. `+3 Spirit Power`. */
  name: string;
  /** Localized name of the stat it raises, e.g. `Spirit Power`. */
  statName: string | null;
  unit: string | null;
  /** The in-game stat graph color, as a CSS color. */
  color: Color | null;
}

/** Pickup entities by class name (the `buff_type` of the analytics). */
export function buffInfoByType(
  entities: readonly Pick<
    MiscEntity,
    "class_name" | "name" | "buff_type_name" | "buff_type_value_unit" | "buff_type_graph_color"
  >[],
): Map<string, BuffInfo> {
  const map = new Map<string, BuffInfo>();
  for (const entity of entities) {
    if (!entity.name && !entity.buff_type_name) continue;
    const color = entity.buff_type_graph_color;
    map.set(entity.class_name, {
      name: entity.name ?? entity.class_name,
      statName: entity.buff_type_name ?? null,
      unit: entity.buff_type_value_unit ?? null,
      color: color ? `rgb(${color.red}, ${color.green}, ${color.blue})` : null,
    });
  }
  return map;
}

/** `spirit_permanent_pickup` as a name while the assets are missing: `Spirit`. */
export function humanizeBuffStat(stat: string): string {
  const base = stat.replace(/_(permanent|powerup)_pickup$/, "").replace(/_/g, " ");
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Whether a buff type only exists since the update that added pickup times: every one of its pickups is timed. The
 * resist, range and move speed buffs came with it, so over a range reaching back before it they would read as rarely
 * picked up, when older matches simply could not have them.
 */
export function isBuffAddedWithTimings(row: AnalyticsBuffStats): boolean {
  return row.is_permanent && row.pickups > 0 && row.timed_pickups === row.pickups && row.timed_matches > 0;
}

/** The player-matches a buff type's rates are over: the timed ones for a type the update added, else all of them. */
export function buffMatchBase(row: AnalyticsBuffStats): number {
  return isBuffAddedWithTimings(row) ? row.timed_matches : row.matches;
}

export interface BuffStatSummary {
  /** Buff type without its level. */
  stat: string;
  name: string;
  unit: string | null;
  color: Color | null;
  /** Pickups of all its levels per player-match. */
  pickupsPerMatch: number;
  /** Stat gained per player-match with timings, `null` without any. */
  valuePerMatch: number | null;
  /** The levels, lowest first, that were picked up at least once. */
  levels: AnalyticsBuffStats[];
}

/**
 * Permanent buffs grouped by the stat they raise, most picked first. Levels no one picked up are dropped: a buff type
 * added by an update reads zero over older matches, which says it did not exist, not that no one wanted it.
 */
export function summarizeBuffStats(
  rows: readonly AnalyticsBuffStats[],
  info: Map<string, BuffInfo>,
): BuffStatSummary[] {
  const groups = new Map<string, AnalyticsBuffStats[]>();
  for (const row of rows) {
    if (!row.is_permanent || row.pickups === 0) continue;
    const { stat } = parseBuffType(row.buff_type);
    const group = groups.get(stat);
    if (group) group.push(row);
    else groups.set(stat, [row]);
  }
  return [...groups.entries()]
    .map(([stat, levels]): BuffStatSummary => {
      levels.sort((a, b) => parseBuffType(a.buff_type).level - parseBuffType(b.buff_type).level);
      const first = info.get(levels[0].buff_type);
      const matches = buffMatchBase(levels[0]);
      const timedMatches = levels[0].timed_matches;
      const pickups = levels.reduce((sum, row) => sum + row.pickups, 0);
      const value = levels.reduce((sum, row) => sum + row.total_stat_value, 0);
      return {
        stat,
        name: first?.statName ?? humanizeBuffStat(stat),
        unit: first?.unit ?? null,
        color: first?.color ?? null,
        pickupsPerMatch: matches > 0 ? pickups / matches : 0,
        valuePerMatch: timedMatches > 0 ? value / timedMatches : null,
        levels,
      };
    })
    .sort((a, b) => b.pickupsPerMatch - a.pickupsPerMatch || a.name.localeCompare(b.name));
}
