import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAbilityTrie, packAbilityOrderTree, unpackAbilityOrderTree } from "./ability-order-utils";

const row = (abilities: number[], wins: number, losses = 3) => ({
  abilities,
  wins,
  losses,
  matches: wins + losses,
  players: 4,
  total_kills: 5,
  total_deaths: 6,
  total_assists: 7,
  // Whole seconds, as the pack rounds them.
  avg_upgrade_time_s: 60 * abilities.length,
});

test("packed ability order tree nodes unpack to the same rows", () => {
  const rows = [row([539192269], 9), row([539192269, 539192269], 6), row([539192269, 539192269, 1074714947], 2)];
  const packed = packAbilityOrderTree(rows);
  assert.ok(!Array.isArray(packed));
  assert.deepEqual(packed.orders, ["0", "00", "001"]);
  assert.deepEqual(unpackAbilityOrderTree(packed), rows);
});

test("more ability ids than base-36 digits stay unpacked", () => {
  const rows = [
    row(
      Array.from({ length: 40 }, (_, i) => i + 1),
      1,
    ),
  ];
  assert.equal(packAbilityOrderTree(rows), rows);
  assert.equal(unpackAbilityOrderTree(rows), rows);
});

test("each row is its own node, and the root sums the first upgrades", () => {
  const root = buildAbilityTrie([row([1, 1], 30, 20), row([1], 60, 40), row([2], 10, 10), row([1, 2], 25, 15)]);
  assert.equal(root.matches, 120);
  assert.equal(root.wins, 70);
  const first = root.children.get(1);
  assert.equal(first?.matches, 100);
  assert.equal(first?.avgTimeS, 60);
  // A node's stats are its row's, not the sum of its children (players who stopped at it count too).
  assert.equal(first?.children.get(1)?.matches, 50);
  assert.equal(first?.children.get(2)?.wins, 25);
  assert.equal(root.avgTimeS, null);
});
