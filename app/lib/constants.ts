import { day } from "~/dayjs";

export const PATCHES = [
  {
    id: "2025-06-17",
    name: "Latest Patch (2025-06-17)",
    startDate: day("2025-06-17T20:34:00Z"),
    endDate: day().startOf("day"),
  },
  {
    id: "2025-05-08",
    name: "Major Item Rework (2025-05-08)",
    startDate: day("2025-05-08T19:43:20Z"),
    endDate: day().startOf("day"),
  },
  {
    id: "2025-02-25",
    name: "Major Map Rework (2025-02-25)",
    startDate: day("2025-02-25T21:51:13Z"),
    endDate: day("2025-05-08T19:43:20Z"),
  },
];

export const API_ORIGIN = "https://api.deadlock-api.com";
export const ASSETS_ORIGIN = "https://assets.deadlock-api.com";
