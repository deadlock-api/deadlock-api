import { type Dayjs, day } from "~/dayjs";

export const PATCHES = [
  {
    id: "2026-04-10",
    name: "Update (2026-04-10)",
    startDate: day.utc("2026-04-11T04:03:00Z").local(),
    endDate: day.utc().endOf("day").local(),
  },
  {
    id: "2026-01-21",
    name: "Old Gods, New Blood (2026-01-21)",
    startDate: day.utc("2026-01-21T02:10:58Z").local(),
    endDate: day.utc().endOf("day").local(),
  },
  {
    id: "2025-09-06",
    name: "Six New Heroes (2025-09-06)",
    startDate: day.utc("2025-09-06T20:00:00Z").local(),
    endDate: day.utc().endOf("day").local(),
  },
  {
    id: "2025-05-08",
    name: "Major Item Rework (2025-05-08)",
    startDate: day.utc("2025-05-08T19:43:20Z").local(),
    endDate: day.utc().endOf("day").local(),
  },
  {
    id: "2025-02-25",
    name: "Major Map Rework (2025-02-25)",
    startDate: day.utc("2025-02-25T21:51:13Z").local(),
    endDate: day.utc("2025-05-08T19:43:20Z").local(),
  },
];

const MIN_PATCH_AGE_DAYS = 7;
const FALLBACK_RANGE_DAYS = 14;

/** Fresh patches lack enough data for meaningful stats, so fall back to a rolling window. */
export const DEFAULT_DATE_RANGE: [Dayjs, Dayjs] = (() => {
  const latestPatch = PATCHES[0];
  const daysSincePatch = day().diff(latestPatch.startDate, "day");
  if (daysSincePatch < MIN_PATCH_AGE_DAYS) {
    return [day().subtract(FALLBACK_RANGE_DAYS, "day").startOf("day"), day().endOf("day")];
  }
  return [latestPatch.startDate, latestPatch.endDate];
})();

export const MIN_GAME_DURATION_S = 0;
export const MAX_GAME_DURATION_S = 60 * 60;

/** Pickrate multiplier = 2 * team_size (both teams), used to normalize pick rates */
export function getPickrateMultiplier(gameMode?: "normal" | "street_brawl"): number {
  return gameMode === "street_brawl" ? 8 : 12;
}

/** Duration buckets for hero stats by game length */
export const DURATION_BUCKETS = [
  { label: "< 25m", minS: 0, maxS: 1500 },
  { label: "25-30m", minS: 1500, maxS: 1800 },
  { label: "30-35m", minS: 1800, maxS: 2100 },
  { label: "35-40m", minS: 2100, maxS: 2400 },
  { label: "40-45m", minS: 2400, maxS: 2700 },
  { label: "45-50m", minS: 2700, maxS: 3000 },
  { label: "50+m", minS: 3000, maxS: 7000 },
] as const;

/** Minimum matches required per duration bucket to display data */
export const MIN_MATCHES_PER_BUCKET = 10;

export const IS_DEV = import.meta.env.DEV;

export const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || "https://api.deadlock-api.com").replace(/\/+$/, "");
export const ASSETS_ORIGIN = (import.meta.env.VITE_ASSETS_BASE_URL || "https://assets.deadlock-api.com").replace(
  /\/+$/,
  "",
);
export const AI_ASSISTANT_API_URL =
  import.meta.env.VITE_AI_ASSISTANT_API_URL || "https://ai-assistant.deadlock-api.com";
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "0x4AAAAAABs5lyUV9iomsdK2";
