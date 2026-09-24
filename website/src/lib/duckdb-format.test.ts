import assert from "node:assert/strict";
import { test } from "node:test";

import { formatDuckDbValue as fmt } from "./duckdb-format";

test("timestamps print as ISO strings at their own precision", () => {
  assert.equal(
    fmt(1_704_164_645_123_456n, { kind: "timestamp", unit: "us", utc: false }),
    "2024-01-02T03:04:05.123456",
  );
  assert.equal(fmt(1_704_164_645_000_000n, { kind: "timestamp", unit: "us", utc: true }), "2024-01-02T03:04:05Z");
  assert.equal(fmt(1_704_164_645_500n, { kind: "timestamp", unit: "ms", utc: false }), "2024-01-02T03:04:05.5");
  assert.equal(fmt(1_704_164_645n, { kind: "timestamp", unit: "s", utc: false }), "2024-01-02T03:04:05");
  assert.equal(
    fmt(1_704_164_645_123_456_789n, { kind: "timestamp", unit: "ns", utc: false }),
    "2024-01-02T03:04:05.123456789",
  );
});

test("timestamps before 1970 and infinite timestamps", () => {
  assert.equal(fmt(-1n, { kind: "timestamp", unit: "us", utc: false }), "1969-12-31T23:59:59.999999");
  assert.equal(fmt(-2_208_988_800_000_000n, { kind: "timestamp", unit: "us", utc: false }), "1900-01-01T00:00:00");
  assert.equal(fmt(9_223_372_036_854_775_807n, { kind: "timestamp", unit: "us", utc: false }), "infinity");
  assert.equal(fmt(-9_223_372_036_854_775_807n, { kind: "timestamp", unit: "us", utc: false }), "-infinity");
});

test("dates print as YYYY-MM-DD", () => {
  assert.equal(fmt(19_724, { kind: "date" }), "2024-01-02");
  assert.equal(fmt(-25_447, { kind: "date" }), "1900-05-01");
  assert.equal(fmt(-2_147_483_647, { kind: "date" }), "-infinity");
});

test("times print as a clock", () => {
  assert.equal(fmt(45_296_789_000n, { kind: "time", unit: "us" }), "12:34:56.789");
  assert.equal(fmt(0n, { kind: "time", unit: "us" }), "00:00:00");
  assert.equal(fmt(43_200, { kind: "time", unit: "s" }), "12:00:00");
});

test("decimals apply their scale, HUGEINT prints its digits", () => {
  assert.equal(fmt(31_416n, { kind: "decimal", scale: 4 }), "3.1416");
  assert.equal(fmt(-31_416n, { kind: "decimal", scale: 4 }), "-3.1416");
  assert.equal(fmt(15n, { kind: "decimal", scale: 1 }), "1.5");
  assert.equal(fmt(5n, { kind: "decimal", scale: 3 }), "0.005");
  assert.equal(fmt(-5n, { kind: "decimal", scale: 3 }), "-0.005");
  assert.equal(fmt(12_345_678_901_234_567_890_123n, { kind: "decimal", scale: 0 }), "12345678901234567890123");
});

test("intervals print like DuckDB", () => {
  assert.equal(
    fmt({ months: 14, days: 3, nanos: 14_706_500_000_000n }, { kind: "interval" }),
    "1 year 2 months 3 days 04:05:06.5",
  );
  assert.equal(fmt({ months: 0, days: 0, nanos: -300_000_000_000n }, { kind: "interval" }), "-00:05:00");
  assert.equal(fmt({ months: 0, days: 1, nanos: 0n }, { kind: "interval" }), "1 day");
  assert.equal(fmt({ months: 0, days: 0, nanos: 0n }, { kind: "interval" }), "00:00:00");
});

test("blobs print printable bytes and escape the rest", () => {
  assert.equal(fmt(new Uint8Array([97, 0, 98, 92, 255]), { kind: "binary" }), String.raw`a\x00b\x5C\xFF`);
});

test("lists and structs format their items by type", () => {
  assert.equal(fmt([19_724, null], { kind: "list", item: { kind: "date" } }), "[2024-01-02, NULL]");
  assert.equal(
    fmt(["x", 31_416n], {
      kind: "struct",
      fields: [
        { name: "s", type: { kind: "other" } },
        { name: "d", type: { kind: "decimal", scale: 4 } },
      ],
    }),
    "{'s': 'x', 'd': 3.1416}",
  );
});

test("plain values and NULL", () => {
  assert.equal(fmt(42n), "42");
  assert.equal(fmt(1.5), "1.5");
  assert.equal(fmt("text"), "text");
  assert.equal(fmt(true), "true");
  assert.equal(fmt(null), "—");
  assert.equal(fmt(undefined, undefined, ""), "");
});
