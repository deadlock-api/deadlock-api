import { day } from "~/dayjs";

export const PATCHES = [
  {
    id: "2025-05-27",
    name: "Latest Patch (2025-05-27)",
    startDate: day("2025-05-27T23:47:06Z"),
    endDate: day().endOf("day"),
  },
  {
    id: "2025-05-08",
    name: "Major Item Rework (2025-05-08)",
    startDate: day("2025-05-08T19:43:20Z"),
    endDate: day().endOf("day"),
  },
  {
    id: "2025-02-25",
    name: "Major Map Rework (2025-02-25)",
    startDate: day("2025-02-25T21:51:13Z"),
    endDate: day("2025-05-08T19:43:20Z"),
  },
];
