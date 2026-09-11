import assert from "node:assert/strict";
import { test } from "node:test";

import { combatStats, resolveCustomStats } from "./combat-stats";

const snapshot = (time: number, hits: number, shots: number, headshots: number) => ({
  time_stamp_s: time,
  custom_user_stats: {
    "Enemy Hero Accuracy##Shots": shots,
    "Enemy Hero Accuracy##Hits": hits,
    "Enemy Hero Accuracy##Headshots": headshots,
  },
});

test("uses the latest timestamp even when an earlier snapshot has a higher rate", () => {
  const result = combatStats([snapshot(600, 40, 200, 10), snapshot(180, 30, 50, 9)]);
  assert.equal(result?.sampledAt, 600);
  assert.equal(result?.metrics[0].share, 0.2);
  assert.equal(result?.metrics[1].share, 0.25, "headshots are a share of hits, not shots");
});

test("missing and malformed data stays unavailable, while a recorded zero accuracy is valid", () => {
  for (const raw of [null, [], "bad", {}, { "Enemy Hero Accuracy##Hits": "4" }]) {
    assert.equal(combatStats([{ time_stamp_s: 300, custom_user_stats: raw }]), null);
  }
  assert.equal(combatStats([snapshot(300, 0, 0, 0)]), null);
  assert.equal(combatStats([snapshot(300, 0, 100, 0)])?.metrics[0].share, 0);
  assert.equal(combatStats([snapshot(300, 101, 100, -1)]), null);
  assert.equal(combatStats([snapshot(NaN, 10, 100, 1)]), null);
  assert.equal(combatStats([snapshot(300, Infinity, 100, NaN)]), null);
  assert.equal(combatStats([snapshot(180, 30, 50, 9), { time_stamp_s: 600 }]), null);
});

test("falloff uses all recorded falloff categories and incoming accuracy uses incoming shots", () => {
  const result = combatStats([
    {
      time_stamp_s: 600,
      custom_user_stats: {
        "Enemy Hero Falloff##No Falloff": 10,
        "Enemy Hero Falloff##Partial Falloff": 20,
        "Enemy Hero Falloff##Max Falloff": 10,
        "Enemy Hero Accuracy - Incoming##Hits": 40,
        "Enemy Hero Accuracy - Incoming##Shots": 200,
      },
    },
  ]);
  assert.deepEqual(
    result?.metrics.map((metric) => metric.share),
    [0.25, 0.2],
  );
});

test("REST match-local names produce the same metrics as GraphQL and ignore unknown ids", () => {
  const names = new Map([
    [42, "Enemy Hero Accuracy##Hits"],
    [8, "Enemy Hero Accuracy##Shots"],
    [91, "Enemy Hero Accuracy##Headshots"],
  ]);
  const raw = [{ id: 42, value: 40 }, { id: 8, value: 200 }, { id: 91, value: 10 }, { id: 1, value: 999 }, null];
  assert.deepEqual(
    combatStats([{ time_stamp_s: 600, custom_user_stats: resolveCustomStats(raw, names) }]),
    combatStats([snapshot(600, 40, 200, 10)]),
  );
  assert.deepEqual(resolveCustomStats(null, names), {});
});
