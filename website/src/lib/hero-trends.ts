import type { HERO_STATS_WITH_BAN_RATE } from "~/types/api_hero_stats";

export type HeroTrendStat = (typeof HERO_STATS_WITH_BAN_RATE)[number];
export type HeroTrendPoint = { date: number } & Record<string, number>;
export type HeroTrendBuckets = Record<number, [heroId: number, value: number, matches?: number][]>;

export const HERO_TREND_LABELS: Record<HeroTrendStat, string> = {
  winrate: "Win rate",
  wins: "Wins",
  losses: "Losses",
  matches: "Matches",
  kills_per_match: "Kills per match",
  deaths_per_match: "Deaths per match",
  assists_per_match: "Assists per match",
  net_worth_per_match: "Net worth per match",
  last_hits_per_match: "Last hits per match",
  denies_per_match: "Denies per match",
  ban_rate: "Ban rate",
};

export function isPercentageTrend(stat: HeroTrendStat) {
  return stat === "winrate" || stat === "ban_rate";
}

export function formatTrendValue(value: number, stat: HeroTrendStat) {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}${isPercentageTrend(stat) ? "%" : ""}`;
}

export function formatTrendChange(value: number, stat: HeroTrendStat) {
  const rounded = Math.round(value * 100) / 100 || 0;
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("en-US", { maximumFractionDigits: 2 })}${isPercentageTrend(stat) ? " pp" : ""}`;
}

/** Retain empty buckets and insert a gap marker when the API omits a whole interval. */
export function buildHeroTrendPoints(buckets: HeroTrendBuckets, interval: string): HeroTrendPoint[] {
  const step = interval === "start_time_hour" ? 3_600_000 : interval === "start_time_week" ? 604_800_000 : 86_400_000;
  const points: HeroTrendPoint[] = [];
  for (const [timestamp, stats] of Object.entries(buckets).sort(([a], [b]) => Number(a) - Number(b))) {
    const date = Number(timestamp) * 1000;
    const previous = points.at(-1);
    if (previous && date - previous.date > step) points.push({ date: previous.date + step });
    const point: HeroTrendPoint = { date };
    for (const [heroId, value, matches] of stats) {
      if (!Number.isFinite(value)) continue;
      point[heroId] = value;
      if (matches != null) point[`${heroId}_matches`] = matches;
    }
    points.push(point);
  }
  return points;
}

export function summarizeHeroTrend(points: HeroTrendPoint[], heroId: number) {
  let first: HeroTrendPoint | undefined;
  let latest: HeroTrendPoint | undefined;
  let buckets = 0;
  for (const point of points) {
    if (!Number.isFinite(point[heroId])) continue;
    first ??= point;
    latest = point;
    buckets += 1;
  }
  if (!first || !latest) return null;
  return {
    heroId,
    firstDate: first.date,
    latestDate: latest.date,
    firstValue: first[heroId],
    latestValue: latest[heroId],
    change: buckets > 1 ? latest[heroId] - first[heroId] : null,
    buckets,
    latestMatches: latest[`${heroId}_matches`],
  };
}

export function heroTrendsCsv(
  points: HeroTrendPoint[],
  heroes: { id: number; name: string }[],
  stat: HeroTrendStat,
  interval: string,
) {
  const rows: (string | number)[][] = [["date_utc", "hero_id", "hero", "metric", "value", "matches", "interval"]];
  for (const point of points) {
    for (const hero of heroes) {
      if (!Number.isFinite(point[hero.id])) continue;
      rows.push([
        new Date(point.date).toISOString(),
        hero.id,
        hero.name,
        stat,
        point[hero.id],
        point[`${hero.id}_matches`] ?? "",
        interval,
      ]);
    }
  }
  return rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
}

/**
 * Picks the heroes to show from a requested selection. `null` (nothing chosen yet) falls back to the
 * default: hero 2 when the roster has it, else the first hero. Ids outside the roster (unknown in the
 * URL, or without data under the current filters) are dropped; when that leaves nothing of a non-empty
 * request, the default applies instead of an empty chart. An explicit empty selection stays empty.
 */
export function resolveVisibleHeroIds(allHeroIds: readonly number[], requested: readonly number[] | null): number[] {
  const fallback = allHeroIds.includes(2) ? [2] : allHeroIds.slice(0, 1);
  if (requested == null) return fallback;
  const known = new Set(allHeroIds);
  const kept = [...new Set(requested)].filter((id) => known.has(id));
  return kept.length === 0 && requested.length > 0 ? fallback : kept;
}
