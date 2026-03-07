import { day } from "~/dayjs";

export const PATCHES = [
  {
    id: "2026-03-06",
    name: "2026-03-06",
    startDate: day.utc("2026-03-06T21:37:48Z").local(),
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
    startDate: day("2025-09-06T20:00:00Z"),
    endDate: day().utc().endOf("day").local(),
  },
  {
    id: "2025-05-08",
    name: "Major Item Rework (2025-05-08)",
    startDate: day("2025-05-08T19:43:20Z"),
    endDate: day().utc().endOf("day").local(),
  },
  {
    id: "2025-02-25",
    name: "Major Map Rework (2025-02-25)",
    startDate: day("2025-02-25T21:51:13Z"),
    endDate: day("2025-05-08T19:43:20Z"),
  },
];

export const MIN_GAME_DURATION_S = 0;
export const MAX_GAME_DURATION_S = 60 * 60;

export const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || "https://api.deadlock-api.com").replace(/\/+$/, "");
export const ASSETS_ORIGIN = (import.meta.env.VITE_ASSETS_BASE_URL || "https://assets.deadlock-api.com").replace(
  /\/+$/,
  "",
);
