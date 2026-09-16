import assert from "node:assert/strict";
import { test } from "node:test";

import { LEGACY_PAGE_PATHS, migrateLegacyHref } from "./site-route-migration";

test("legacy category pages redirect with filters and fragments intact", () => {
  for (const [legacy, destination] of Object.entries(LEGACY_PAGE_PATHS)) {
    assert.equal(
      migrateLegacyHref(`${legacy}?hero=11&date_range=_#results`),
      `${destination}?hero=11&date_range=_#results`,
    );
  }
  assert.equal(migrateLegacyHref("/heroes/lady-geist?min_rank=91"), "/analytics/heroes/lady-geist?min_rank=91");
  assert.equal(migrateLegacyHref("/items/extra-health"), "/analytics/items/extra-health");
});

test("tracker profiles and other navigation categories keep their URLs", () => {
  for (const href of [
    "/players/400239835?match=105968442",
    "/tracker",
    "/blog/example",
    "/deadlockdle",
    "/streamkit",
    "/patron",
    "/analytics/heroes",
  ]) {
    assert.equal(migrateLegacyHref(href), null);
  }
});
