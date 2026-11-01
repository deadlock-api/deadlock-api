import assert from "node:assert/strict";
import { test } from "node:test";

import type { Upgrade } from "deadlock_api_client";

import { giveawayNameWords, maskName } from "./item-name-mask";

function item(id: number, name: string, loc: string): Upgrade {
  return { id, name, tooltip_sections: [{ section_attributes: [{ loc_string: loc }] }] } as unknown as Upgrade;
}

const carpet = item(
  1,
  "Magic Carpet",
  'Summon a Magic Carpet that will <span class="highlight">fly</span> you away. Any action will dismiss the carpet.',
);
const shredder = item(2, "Spirit Shredder", "Your bullets reduce the Spirit Resist of the target.");
const sap = item(3, "Spirit Sap", "Reduce their Spirit Resist and Spirit Power.");

test("giveawayNameWords keeps words other items use and picks the ones only this item uses", () => {
  const words = giveawayNameWords([carpet, shredder, sap]);
  assert.deepEqual(words.get(1), ["Carpet"]);
  assert.equal(words.has(2), false);
  assert.equal(words.has(3), false);
});

test("maskName hides the full name and every whole-word giveaway", () => {
  assert.equal(
    maskName("Summon a Magic Carpet. Dismiss the carpet. Carpeted floors.", "Magic Carpet", ["Carpet"]),
    "Summon a ???. Dismiss the ???. Carpeted floors.",
  );
});

test("maskName escapes regex characters in the name", () => {
  assert.equal(maskName("Use Item (Mk. 2) now", "Item (Mk. 2)"), "Use ??? now");
});
