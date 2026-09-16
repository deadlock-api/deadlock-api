import assert from "node:assert/strict";
import { test } from "node:test";

import type { SlimUpgrade } from "~/queries/asset-queries";
import type { TrackerAbility } from "~/queries/tracker-queries";

import { type BuildItem, buildTimeline, type PlayerBuild } from "./build";

const ability: TrackerAbility = { id: 1, name: "Charge", class_name: "charge", image: null, image_webp: null };
const item = (boughtAt: number, soldAt: number | null): BuildItem => ({
  upgrade: { id: 2, name: "Sprint Boots" } as SlimUpgrade,
  boughtAt,
  soldAt,
  imbuedInto: undefined,
  stacks: undefined,
});

test("build timeline interleaves abilities, purchases and sales by match time", () => {
  const build: PlayerBuild = {
    abilities: [{ ability, unlockedAt: 0, upgradedAt: [120, 300], stacks: undefined }],
    items: [item(30, 200), item(180, null)],
  };
  const before = structuredClone(build);
  assert.deepEqual(
    buildTimeline(build).map((event) => [event.kind, event.time]),
    [
      ["unlock", 0],
      ["purchase", 30],
      ["upgrade", 120],
      ["purchase", 180],
      ["sale", 200],
      ["upgrade", 300],
    ],
  );
  assert.deepEqual(build, before, "the grouped scoreboard build must not change");
});

test("build timeline retains repeated purchases and coincident events", () => {
  const build: PlayerBuild = {
    abilities: [{ ability, unlockedAt: 5, upgradedAt: [30, 30], stacks: undefined }],
    items: [item(5, 30), item(30, 60), item(90, null)],
  };
  const events = buildTimeline(build);
  assert.equal(events.length, 8);
  assert.equal(events.filter((event) => event.time === 30).length, 4);
  assert.deepEqual(
    events.filter((event) => event.kind === "purchase").map((event) => event.time),
    [5, 30, 90],
  );
  assert.deepEqual(
    events.filter((event) => event.kind === "sale").map((event) => event.time),
    [30, 60],
  );
});

test("build timeline does not invent missing unlocks or sales and handles empty histories", () => {
  assert.deepEqual(buildTimeline({ abilities: [], items: [] }), []);
  const events = buildTimeline({
    abilities: [{ ability, unlockedAt: null, upgradedAt: [200], stacks: undefined }],
    items: [item(100, null)],
  });
  assert.deepEqual(
    events.map((event) => [event.kind, event.time]),
    [
      ["purchase", 100],
      ["upgrade", 200],
    ],
  );
});

test("slot order and out-of-order source arrays do not override recorded chronology", () => {
  const events = buildTimeline({
    abilities: [
      { ability, unlockedAt: 60, upgradedAt: [400, 200], stacks: undefined },
      { ability: { ...ability, id: 3 }, unlockedAt: 0, upgradedAt: [300], stacks: undefined },
    ],
    items: [item(500, null), item(100, 450)],
  });
  assert.deepEqual(
    events.map((event) => event.time),
    [0, 60, 100, 200, 300, 400, 450, 500],
  );
});
