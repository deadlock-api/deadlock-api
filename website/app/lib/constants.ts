import dayjs from "dayjs";

export const PATCHES = [
  {
    id: "2025-05-08",
    name: "Major Patch (2025-05-08)",
    startDate: dayjs("2025-05-08T19:43:20Z"),
    endDate: dayjs().endOf("day"),
  },
  {
    id: "2025-05-11",
    name: "Latest Patch (2025-05-11)",
    startDate: dayjs("2025-05-11T19:06:03Z"),
    endDate: dayjs().endOf("day"),
  },
  {
    id: "2025-02-25",
    name: "Previous Major Patch (2025-02-25)",
    startDate: dayjs("2025-02-25T21:51:13Z"),
    endDate: dayjs("2025-05-08T19:43:20Z"),
  },
];
