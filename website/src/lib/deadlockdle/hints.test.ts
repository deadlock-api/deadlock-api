import assert from "node:assert/strict";
import { test } from "node:test";

import { itemPropertyHint } from "./hints";

test("an item's property hint prefers a number and keeps its unit", () => {
  assert.equal(
    itemPropertyHint({
      a: { label: "Effect", value: "Silence" },
      b: { label: "Cooldown", value: 23, postfix: "s" },
    }),
    "Cooldown: 23s",
  );
  assert.equal(itemPropertyHint({ a: { label: "Range", value: "12m", postfix: "m" } }), "Range: 12m");
});

test("an item without labelled properties says so", () => {
  assert.equal(itemPropertyHint(null), "No properties available");
  assert.equal(itemPropertyHint({ a: { value: 3 }, b: { label: "Bonus", value: null } }), "No properties available");
});
