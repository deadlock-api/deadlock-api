import { type Dayjs, day } from "~/dayjs";

export const IS_DEV = import.meta.env.DEV;

export const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || "https://api.deadlock-api.com").replace(/\/+$/, "");
export interface PatchInfo {
  id: string;
  name: string;
  /** A label for tight spots such as the patch lines on a small chart: "Patch" for a minor update. */
  shortName: string;
  startDate: Dayjs;
  // Undefined = patch is currently active (open-ended). Keeping this stable
  // (no `day.utc()` at module load) is what lets SSR-prerendered HTML match
  // client-side hydration — otherwise the "now" used at build time drifts.
  endDate?: Dayjs;
}

export const PATCHES: readonly PatchInfo[] = [
  {
    id: "2026-09-29",
    name: "City Never Sleeps (2026-09-29)",
    shortName: "City Never Sleeps",
    startDate: day.utc("2026-09-29T20:25:11Z").local(),
  },
  {
    id: "2026-09-16",
    name: "Minor Update (2026-09-16)",
    shortName: "Patch",
    startDate: day.utc("2026-09-16T22:41:46Z").local(),
    endDate: day.utc("2026-09-29T20:25:11Z").local(),
  },
  {
    id: "2026-07-30",
    name: "Matchmaking Update (2026-07-30)",
    shortName: "Matchmaking",
    startDate: day.utc("2026-07-30T19:14:37Z").local(),
    endDate: day.utc("2026-09-16T22:41:46Z").local(),
  },
  {
    id: "2026-07-28",
    name: "Minor Update (2026-07-28)",
    shortName: "Patch",
    startDate: day.utc("2026-07-28T20:24:35Z").local(),
    endDate: day.utc("2026-07-30T19:14:37Z").local(),
  },
  {
    id: "2026-07-09",
    name: "Minor Update (2026-07-09)",
    shortName: "Patch",
    startDate: day.utc("2026-07-09T19:27:38Z").local(),
    endDate: day.utc("2026-07-28T20:24:35Z").local(),
  },
  {
    id: "2026-07-01",
    name: "Minor Update (2026-07-01)",
    shortName: "Patch",
    startDate: day.utc("2026-07-01T22:54:59Z").local(),
    endDate: day.utc("2026-07-09T19:27:38Z").local(),
  },
  {
    id: "2026-06-30",
    name: "Minor Update (2026-06-30)",
    shortName: "Patch",
    startDate: day.utc("2026-06-30T17:37:32Z").local(),
    endDate: day.utc("2026-07-01T22:54:59Z").local(),
  },
  {
    id: "2026-06-11",
    name: "Minor Update (2026-06-11)",
    shortName: "Patch",
    startDate: day.utc("2026-06-12T00:59:45Z").local(),
    endDate: day.utc("2026-06-30T17:37:32Z").local(),
  },
  {
    id: "2026-06-04",
    name: "Minor Update - Urn #4 (2026-06-04)",
    shortName: "Urn #4",
    startDate: day.utc("2026-06-04T17:30:11Z").local(),
    endDate: day.utc("2026-06-12T00:59:45Z").local(),
  },
  {
    id: "2026-05-31",
    name: "Minor Update - Heroes (2026-05-31)",
    shortName: "Heroes",
    startDate: day.utc("2026-05-31T19:46:45Z").local(),
    endDate: day.utc("2026-06-04T17:30:11Z").local(),
  },
  {
    id: "2026-05-28",
    name: "Minor Update - Urn #3 (2026-05-28)",
    shortName: "Urn #3",
    startDate: day.utc("2026-05-28T17:14:59Z").local(),
    endDate: day.utc("2026-07-30T19:14:37Z").local(),
  },
  {
    id: "2026-05-25",
    name: "Minor Update - Urn #2 (2026-05-25)",
    shortName: "Urn #2",
    startDate: day.utc("2026-05-26T00:53:00Z").local(),
    endDate: day.utc("2026-05-28T17:14:59Z").local(),
  },
  {
    id: "2026-05-22",
    name: "Gameplay Update - Urn #1 (2026-05-22)",
    shortName: "Urn #1",
    startDate: day.utc("2026-05-22T21:50:00Z").local(),
    endDate: day.utc("2026-05-26T00:53:00Z").local(),
  },
  {
    id: "2026-04-30",
    name: "Gameplay Update (2026-04-30)",
    shortName: "Gameplay",
    startDate: day.utc("2026-05-01T23:49:47Z").local(),
    endDate: day.utc("2026-05-22T21:50:00Z").local(),
  },
  {
    id: "2026-04-10",
    name: "Update (2026-04-10)",
    shortName: "Patch",
    startDate: day.utc("2026-04-11T04:03:00Z").local(),
    endDate: day.utc("2026-05-01T23:49:47Z").local(),
  },
  {
    id: "2026-01-21",
    name: "Old Gods, New Blood (2026-01-21)",
    shortName: "Old Gods, New Blood",
    startDate: day.utc("2026-01-21T02:10:58Z").local(),
    endDate: day.utc("2026-04-11T04:03:00Z").local(),
  },
  {
    id: "2025-09-06",
    name: "Six New Heroes (2025-09-06)",
    shortName: "Six New Heroes",
    startDate: day.utc("2025-09-06T20:00:00Z").local(),
    endDate: day.utc("2026-01-21T02:10:58Z").local(),
  },
  {
    id: "2025-05-08",
    name: "Major Item Rework (2025-05-08)",
    shortName: "Item Rework",
    startDate: day.utc("2025-05-08T19:43:20Z").local(),
    endDate: day.utc("2025-09-06T20:00:00Z").local(),
  },
  {
    id: "2025-02-25",
    name: "Major Map Rework (2025-02-25)",
    shortName: "Map Rework",
    startDate: day.utc("2025-02-25T21:51:13Z").local(),
    endDate: day.utc("2025-05-08T19:43:20Z").local(),
  },
];

export const MAX_GAME_DURATION_S = 60 * 60;

export function getPickrateMultiplier(gameMode?: "normal" | "street_brawl"): number {
  return gameMode === "street_brawl" ? 8 : 12;
}

export const DURATION_BUCKETS = [
  { label: "< 25m", minS: 0, maxS: 1500 },
  { label: "25–30m", minS: 1500, maxS: 1800 },
  { label: "30–35m", minS: 1800, maxS: 2100 },
  { label: "35–40m", minS: 2100, maxS: 2400 },
  { label: "40–45m", minS: 2400, maxS: 2700 },
  { label: "45–50m", minS: 2700, maxS: 3000 },
  { label: "50m+", minS: 3000, maxS: 7000 },
] as const;

// The API counts both ends in, so the buckets must not share one; the last is open, or players past it are dropped.
export const EXPERIENCE_BUCKETS: readonly { label: string; sublabel: string; min: number; max?: number }[] = [
  { label: "Beginner", sublabel: "1-24 matches", min: 1, max: 24 },
  { label: "Intermediate", sublabel: "25-99 matches", min: 25, max: 99 },
  { label: "Experienced", sublabel: "100+ matches", min: 100 },
];

export const MIN_MATCHES_PER_BUCKET = 10;
