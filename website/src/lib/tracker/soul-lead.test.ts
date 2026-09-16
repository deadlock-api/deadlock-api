import assert from "node:assert/strict";
import { test } from "node:test";

import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

import { computeSoulLead } from "./soul-lead";

function player(team: string, samples: [number, number][]): TrackerMatchPlayer {
  return {
    team,
    stats: samples.map(([time_stamp_s, net_worth]) => ({ time_stamp_s, net_worth })),
  } as TrackerMatchPlayer;
}

test("time spent tied does not count as time ahead", () => {
  const lead = computeSoulLead(
    [
      player("own", [
        [60, 100],
        [120, 300],
      ]),
      player("enemy", [
        [60, 100],
        [120, 200],
      ]),
    ],
    "own",
  );
  assert.equal(lead?.aheadShare, 0.5);
});

test("a team that only ties or trails is never counted as ahead", () => {
  const lead = computeSoulLead(
    [
      player("own", [
        [60, 100],
        [120, 200],
      ]),
      player("enemy", [
        [60, 100],
        [120, 300],
      ]),
    ],
    "own",
  );
  assert.equal(lead?.aheadShare, 0);
});

test("lead changes interpolate both directions and invert with the tracked team", () => {
  const players = [
    player("own", [
      [60, 200],
      [120, 200],
      [180, 600],
    ]),
    player("enemy", [
      [60, 100],
      [120, 500],
      [180, 500],
    ]),
  ];
  const lead = computeSoulLead(players, "own");
  const reverse = computeSoulLead(players, "enemy");
  assert.equal(lead?.aheadShare, 0.5);
  assert.equal(reverse?.aheadShare, 0.5);
  assert.deepEqual(lead?.peak, { time: 60, own: 200, enemy: 100, lead: 100 });
  assert.deepEqual(lead?.trough, { time: 120, own: 200, enemy: 500, lead: -300 });
});

test("returning to a tie counts the preceding positive interval but not a tied plateau", () => {
  const lead = computeSoulLead(
    [
      player("own", [
        [60, 200],
        [120, 200],
        [180, 300],
        [240, 500],
      ]),
      player("enemy", [
        [60, 100],
        [120, 200],
        [180, 300],
        [240, 400],
      ]),
    ],
    "own",
  );
  assert.equal(lead?.aheadShare, 0.75);
});

test("missing samples carry forward and unsorted samples leave input unchanged", () => {
  const players = [
    player("own", [
      [120, 300],
      [60, 200],
    ]),
    player("enemy", [[90, 100]]),
  ];
  const original = structuredClone(players);
  const lead = computeSoulLead(players, "own");
  assert.deepEqual(
    lead?.points.map(({ time, own, enemy }) => ({ time, own, enemy })),
    [
      { time: 0, own: 0, enemy: 0 },
      { time: 60, own: 200, enemy: 0 },
      { time: 90, own: 200, enemy: 100 },
      { time: 120, own: 300, enemy: 100 },
    ],
  );
  assert.deepEqual(players, original);
  assert.equal(lead?.aheadShare, 1);
});

test("no timeline and permanently tied timelines have no soul lead", () => {
  assert.equal(computeSoulLead([], "own"), null);
  assert.equal(computeSoulLead([player("own", [])], "own"), null);
  assert.equal(computeSoulLead([player("own", [[60, 100]]), player("enemy", [[60, 100]])], "own"), null);
});
