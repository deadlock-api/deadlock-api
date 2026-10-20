import assert from "node:assert/strict";
import { test } from "node:test";

import { day } from "~/dayjs";

import { formatDateRange } from "./utils";

test("formatDateRange keeps whole UTC days from the URL west of UTC", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  try {
    // How `date_range=2026-10-01_2026-10-07` parses (src/lib/nuqs-parsers.ts).
    const start = day.utc("2026-10-01");
    const end = day.utc("2026-10-07").endOf("day");
    assert.equal(formatDateRange(start, end), "between Oct 1 and Oct 7, 2026");
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
