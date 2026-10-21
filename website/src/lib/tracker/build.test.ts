import assert from "node:assert/strict";
import { test } from "node:test";

import type { SlimUpgrade } from "~/queries/asset-queries";
import type { TrackerAbility, TrackerMatchItem } from "~/queries/tracker-queries";

import { type BuildItem, buildTimeline, type PlayerBuild, playerBuild } from "./build";

const ability: TrackerAbility = { id: 1, name: "Charge", class_name: "charge", image: null, image_webp: null };
const item = (boughtAt: number, soldAt: number | null, builtIntoUpgrade = false): BuildItem => ({
  upgrade: { id: 2, name: "Sprint Boots" } as SlimUpgrade,
  boughtAt,
  soldAt,
  builtIntoUpgrade,
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

// A component built into its upgrade leaves with a sold time too (flags bit 1): in match 121335607, 72 of the 76
// "sales" were upgrades, each at the second the upgrade was bought.
test("build timeline shows no sale for a component built into an upgrade", () => {
  const build: PlayerBuild = { abilities: [], items: [item(59, 870, true), item(300, 600)] };
  assert.deepEqual(
    buildTimeline(build).map((event) => [event.kind, event.time]),
    [
      ["purchase", 59],
      ["purchase", 300],
      ["sale", 600],
    ],
  );
});

test("a build reads flags bit 1 as built into an upgrade and keeps a real sale", () => {
  const shopItem = (item_id: number, game_time_s: number, sold_time_s: number, flags: number): TrackerMatchItem => ({
    item_id,
    game_time_s,
    sold_time_s,
    upgrade_id: 0,
    imbued_ability_id: 0,
    flags,
  });
  const itemsById = new Map(
    [
      { id: 968099481, name: "Extra Spirit" },
      { id: 7409189, name: "Improved Spirit" },
      { id: 2, name: "Sprint Boots" },
    ].map((upgrade) => [upgrade.id, upgrade as SlimUpgrade]),
  );
  const build = playerBuild(
    [shopItem(968099481, 59, 870, 1), shopItem(7409189, 870, 0, 0), shopItem(2, 300, 600, 0)],
    itemsById,
    new Map(),
    undefined,
    {},
  );
  assert.deepEqual(
    buildTimeline(build).map((event) => [event.kind, event.time]),
    [
      ["purchase", 59],
      ["purchase", 300],
      ["sale", 600],
      ["purchase", 870],
    ],
  );
});
