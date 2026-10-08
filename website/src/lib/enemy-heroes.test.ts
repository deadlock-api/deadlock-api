import assert from "node:assert/strict";
import { test } from "node:test";

import { enemyHeroFilter, parseEnemyParam } from "./enemy-heroes";

test("several enemy heroes must all be on the other team", () => {
  assert.deepEqual(enemyHeroFilter([]), {});
  assert.deepEqual(enemyHeroFilter([15]), { enemyHeroIds: "15", enemyHeroIdsAllMatch: undefined });
  assert.deepEqual(enemyHeroFilter([15, 63]), { enemyHeroIds: "15,63", enemyHeroIdsAllMatch: true });
});

test("the enemy parameter reads as the router parses it", () => {
  assert.deepEqual(parseEnemyParam(15), [15]);
  assert.deepEqual(parseEnemyParam("15,63"), [15, 63]);
  assert.deepEqual(parseEnemyParam("x,7"), [7]);
  assert.deepEqual(parseEnemyParam(undefined), []);
});
