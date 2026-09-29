import assert from "node:assert/strict";
import { test } from "node:test";

import { packAbilityOrders, unpackAbilityOrders } from "./ability-order-utils";

const row = (abilities: number[], wins: number) => ({
  abilities,
  wins,
  losses: 3,
  matches: wins + 3,
  players: 4,
  total_kills: 5,
  total_deaths: 6,
  total_assists: 7,
});

test("packed ability orders unpack to the same rows", () => {
  const rows = [row([539192269, 539192269, 1074714947], 9), row([2061574352, 1065103387], 1), row([], 0)];
  const packed = packAbilityOrders(rows);
  assert.ok(!Array.isArray(packed));
  assert.deepEqual(packed.orders, ["001", "23", ""]);
  assert.deepEqual(unpackAbilityOrders(packed), rows);
});

test("more ability ids than base-36 digits stay unpacked", () => {
  const rows = [
    row(
      Array.from({ length: 40 }, (_, i) => i + 1),
      1,
    ),
  ];
  assert.equal(packAbilityOrders(rows), rows);
  assert.equal(unpackAbilityOrders(rows), rows);
});
