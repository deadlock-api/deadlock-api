import assert from "node:assert/strict";
import { test } from "node:test";

import { packColumns, unpackColumns } from "./column-pack";

test("packed columns unpack to the listed fields of each row", () => {
  const rows = [
    { hero_id: 1, wins: 5, losses: 3, extra: 9 },
    { hero_id: 2, wins: 0, losses: 1, extra: 8 },
  ];
  const packed = packColumns(rows, ["hero_id", "wins", "losses"]);
  assert.deepEqual(packed, { hero_id: [1, 2], wins: [5, 0], losses: [3, 1] });
  assert.deepEqual(unpackColumns(packed), [
    { hero_id: 1, wins: 5, losses: 3 },
    { hero_id: 2, wins: 0, losses: 1 },
  ]);
});

test("no rows pack to empty columns and unpack to no rows", () => {
  const packed = packColumns<"wins">([], ["wins"]);
  assert.deepEqual(packed, { wins: [] });
  assert.deepEqual(unpackColumns(packed), []);
});
