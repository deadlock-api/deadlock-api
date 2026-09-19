import assert from "node:assert/strict";
import { test } from "node:test";

import { completeTimeBuckets, withoutOpenTimeBucket } from "./time-buckets";

const now = Date.UTC(2026, 8, 19, 12, 34);
const unix = (date: string) => Date.parse(date) / 1000;

test("repeated hero rows do not count as multiple completed intervals", (context) => {
  context.mock.timers.enable({ apis: ["Date"], now });
  const rows = [
    { bucket: unix("2026-09-18T00:00:00Z"), hero: 1 },
    { bucket: unix("2026-09-18T00:00:00Z"), hero: 2 },
    { bucket: unix("2026-09-19T00:00:00Z"), hero: 1 },
  ];
  assert.equal(withoutOpenTimeBucket(rows, "start_time_day"), rows);
  assert.equal(withoutOpenTimeBucket(rows, "hero"), rows);
});

test("all heroes in an open interval are omitted while closed rows retain their order", (context) => {
  context.mock.timers.enable({ apis: ["Date"], now });
  for (const [interval, older, previous, current] of [
    ["start_time_hour", "2026-09-19T10:00:00Z", "2026-09-19T11:00:00Z", "2026-09-19T12:00:00Z"],
    ["start_time_day", "2026-09-17T00:00:00Z", "2026-09-18T00:00:00Z", "2026-09-19T00:00:00Z"],
    ["start_time_week", "2026-08-31T00:00:00Z", "2026-09-07T00:00:00Z", "2026-09-14T00:00:00Z"],
    ["start_time_month", "2026-07-01T00:00:00Z", "2026-08-01T00:00:00Z", "2026-09-01T00:00:00Z"],
  ]) {
    const rows = [
      { bucket: unix(current), hero: 1 },
      { bucket: unix(previous), hero: 2 },
      { bucket: unix(older), hero: 1 },
      { bucket: unix(current), hero: 2 },
      { bucket: unix(previous), hero: 1 },
    ];
    assert.deepEqual(withoutOpenTimeBucket(rows, interval), [rows[1], rows[2], rows[4]], interval);
    assert.equal(rows.length, 5);
  }
});

test("calendar months close correctly across leap years", (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2024, 2, 15) });
  const rows = ["2024-01-01", "2024-02-01", "2024-03-01"].map((date) => ({ bucket: unix(`${date}T00:00:00Z`) }));
  assert.deepEqual(withoutOpenTimeBucket(rows, "start_time_month"), rows.slice(0, 2));
});

test("hover trends omit partial buckets at both selected boundaries, even with no complete buckets left", (context) => {
  context.mock.timers.enable({ apis: ["Date"], now });
  const rows = [17, 18, 19].map((date) => ({ bucket: unix(`2026-09-${date}T00:00:00Z`) }));
  assert.deepEqual(
    completeTimeBuckets(rows, "start_time_day", {
      minUnixTimestamp: unix("2026-09-17T12:00:00Z"),
      maxUnixTimestamp: unix("2026-09-19T06:00:00Z"),
    }),
    [rows[1]],
  );
  assert.deepEqual(completeTimeBuckets([rows[2]], "start_time_day"), []);
  assert.deepEqual(
    completeTimeBuckets(rows, "start_time_day", {
      minUnixTimestamp: rows[1].bucket,
      maxUnixTimestamp: rows[2].bucket,
    }),
    [rows[1]],
  );
});

test("complete monthly buckets use UTC calendar boundaries, including leap years", (context) => {
  context.mock.timers.enable({ apis: ["Date"], now });
  const rows = ["2024-01-01", "2024-02-01", "2024-03-01"].map((date) => ({ bucket: unix(`${date}T00:00:00Z`) }));
  assert.deepEqual(
    completeTimeBuckets(rows, "start_time_month", {
      minUnixTimestamp: unix("2024-01-15T12:00:00Z"),
      maxUnixTimestamp: unix("2024-03-15T12:00:00Z"),
    }),
    [rows[1]],
  );
});
