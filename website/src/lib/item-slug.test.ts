import assert from "node:assert/strict";
import { test } from "node:test";

import { findRenamedItem } from "./item-slug";

const ITEMS = [
  { id: 673001892, name: "Armor Piercer" },
  { id: 1144549437, name: "Spirit Shredder" },
];

test("an old item name's slug finds the renamed item", () => {
  assert.equal(findRenamedItem(ITEMS, "spirit-shredder-bullets")?.name, "Spirit Shredder");
  assert.equal(findRenamedItem(ITEMS, "armor-piercing-rounds")?.name, "Armor Piercer");
  assert.equal(findRenamedItem(ITEMS, "spirit-shredder"), undefined);
  assert.equal(findRenamedItem(ITEMS, "not-an-item"), undefined);
});
