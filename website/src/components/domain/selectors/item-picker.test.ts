import assert from "node:assert/strict";
import { test } from "node:test";

import {
  chosenPerTab,
  compareShopItems,
  groupByTier,
  itemsInTab,
  type PickableItem,
  tabForSearch,
} from "./item-picker";

const item = (
  id: number,
  name: string,
  item_tier: number,
  item_slot_type: PickableItem["item_slot_type"],
  cost: number | null = [0, 800, 1600, 3200, 6400][item_tier],
): PickableItem => ({ id, name, item_tier, item_slot_type, cost });

const items = [
  item(1, "Spirit Strike", 1, "spirit"),
  item(2, "Headshot Booster", 1, "weapon"),
  item(3, "Extra Health", 1, "vitality"),
  item(4, "Boundless Spirit", 4, "spirit"),
  item(5, "Close Quarters", 1, "weapon"),
  item(6, "Tesla Bullets", 3, "weapon"),
  item(7, "Enchanter's Emblem", 2, "spirit", null),
];

test("shop order is tier, then slot as the shop lays it out, then name", () => {
  assert.deepEqual(
    [...items].sort(compareShopItems).map((i) => i.id),
    [5, 2, 3, 1, 7, 6, 4],
  );
});

test("a slot tab keeps its slot's items; all keeps every item", () => {
  assert.deepEqual(
    itemsInTab(items, "weapon").map((i) => i.id),
    [2, 5, 6],
  );
  assert.equal(itemsInTab(items, "all"), items);
});

test("items group by tier, lowest first, keeping their order, with the tier's cost from the items", () => {
  const groups = groupByTier([items[3], items[1], items[4], items[5], items[6]]);
  assert.deepEqual(
    groups.map((g) => [g.tier, g.cost, g.items.map((i) => i.id)]),
    [
      [1, 800, [2, 5]],
      [2, undefined, [7]],
      [3, 3200, [6]],
      [4, 6400, [4]],
    ],
  );
  assert.deepEqual(groupByTier([]), []);
});

test("a tier's cost is what most of its items cost", () => {
  const [group] = groupByTier([
    item(1, "a", 2, "weapon", 1600),
    item(2, "b", 2, "weapon", 1600),
    item(3, "c", 2, "weapon", 2400),
  ]);
  assert.equal(group.cost, 1600);
});

test("each tab counts its chosen items", () => {
  assert.deepEqual(chosenPerTab(items, new Set([2, 5, 4, 99])), { all: 3, weapon: 2, vitality: 0, spirit: 1 });
});

test("typing a search moves to all and clearing it returns to the slot it left", () => {
  let state = tabForSearch("vitality", null, "", "k");
  assert.deepEqual(state, { tab: "all", from: "vitality" });
  state = tabForSearch(state.tab, state.from, "k", "ke");
  assert.deepEqual(state, { tab: "all", from: "vitality" });
  assert.deepEqual(tabForSearch(state.tab, state.from, "ke", ""), { tab: "vitality", from: null });
  // A tab picked by hand during the search stays when the search is cleared.
  assert.deepEqual(tabForSearch("spirit", null, "ke", ""), { tab: "spirit", from: null });
  // Searching from all has nowhere to return to.
  assert.deepEqual(tabForSearch("all", null, "", "k"), { tab: "all", from: null });
});
