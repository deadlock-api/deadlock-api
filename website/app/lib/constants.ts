import dayjs from "dayjs";

export const PATCHES = [
  {
    id: "2025-05-19",
    name: "Latest Patch (2025-05-19)",
    startDate: dayjs("2025-05-20T00:12:38Z"),
    endDate: dayjs().endOf("day"),
  },
  {
    id: "2025-05-08",
    name: "Major Item Rework (2025-05-08)",
    startDate: dayjs("2025-05-08T19:43:20Z"),
    endDate: dayjs().endOf("day"),
  },
  {
    id: "2025-02-25",
    name: "Major Map Rework (2025-02-25)",
    startDate: dayjs("2025-02-25T21:51:13Z"),
    endDate: dayjs("2025-05-08T19:43:20Z"),
  },
];
