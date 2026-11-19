import assert from "node:assert/strict";
import { test } from "node:test";

import type { EdgeMinute } from "~/lib/live-requests/feed";
import type { LiveStats } from "~/lib/live-requests/useLiveRequests";

import { countryName, markReading } from "./map-readings";

const STATS = {
  perSecond: 312,
  rowsPerSecond: 0,
  bytesPerSecond: 0,
  latency: { p50: 23, p90: 120, p99: 640 },
  errorShare: 0.002,
  routes: [],
  edges: [],
  colos: new Map([
    [
      "FRA",
      {
        entered: 2,
        handed: 0,
        countries: new Map([
          ["DE", 1.5],
          ["NL", 0.5],
        ]),
      },
    ],
    ["HEL", { entered: 0.1, handed: 40, countries: new Map([["FI", 0.1]]) }],
  ]),
  queue: { inFlight: 14, peak: 20, dbRunning: 6, dbWaiting: 1, dbSlots: 48 },
  queueHistory: [],
} satisfies LiveStats;

const EDGE: EdgeMinute = {
  start: 0,
  groups: [
    { kind: "website", colo: "FRA", country: "DE", count: 600 },
    { kind: "assets", colo: "FRA", country: "XX", count: 6000 },
    { kind: "assets", colo: "AMS", country: "NL", count: 60 },
  ],
  perSecond: { apiCache: 0, website: 10, assets: 101, other: 0, lake: 0 },
  cache: null,
  lakeToday: null,
};

const FRA = { kind: "colo", code: "FRA", city: "Frankfurt-am-Main" } as const;

test("markReading: a data center's traffic per minute, its top country without unplaced clients", () => {
  assert.deepEqual(markReading(FRA, STATS, EDGE), {
    title: "Frankfurt-am-Main",
    subtitle: "Cloudflare edge · FRA",
    rows: [
      { label: "To our server", value: "120/min" },
      { label: "Answered by Cloudflare", value: "6.6K/min" },
      // DE: 1.5/s to our server + 10/s answered, of 12/s placed.
      { label: "Top country", value: "Germany · 96%" },
    ],
  });
});

test("markReading: the data center next to our server shows what it handed over", () => {
  const rows = markReading({ kind: "colo", code: "HEL", city: "Helsinki" }, STATS, null).rows;
  assert.deepEqual(rows[1], { label: "Handed to our server", value: "2.4K/min" });
});

test("markReading: our server by its role, with its load", () => {
  const reading = markReading({ kind: "origin" }, STATS, EDGE);
  assert.equal(reading.title, "API server");
  assert.equal(reading.subtitle, undefined);
  assert.deepEqual(
    reading.rows.map((row) => row.label),
    ["Requests", "In progress", "Median time", "Errors (5xx)", "Database queries"],
  );
});

test("markReading: only the name before the first batch", () => {
  assert.deepEqual(markReading(FRA, null, null).rows, []);
  assert.deepEqual(markReading({ kind: "origin" }, null, null).rows, []);
});

test("countryName falls back to the code", () => {
  assert.equal(countryName("DE"), "Germany");
  assert.equal(countryName("T1"), "T1");
});
