import assert from "node:assert/strict";
import { test } from "node:test";

import { canonicalAnalyticsHref } from "./analytics-tabs";
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

test("legacy tab links redirect directly to the requested analytics view", () => {
  assert.equal(
    migrateLegacyHref("/heroes?tab=stats-by-duration&min_rank=61#chart"),
    "/analytics/heroes/by-duration?min_rank=61#chart",
  );
  assert.equal(
    migrateLegacyHref("/items?tab=item-purchase-analysis&hero=11"),
    "/analytics/items/item-purchase-analysis?hero=11",
  );
  assert.equal(
    migrateLegacyHref("/games?tab=economy&game_mode=street_brawl"),
    "/analytics/games/economy?game_mode=street_brawl",
  );
  assert.equal(
    migrateLegacyHref("/players?tab=stats-metrics&min_matches=20"),
    "/analytics/players/stats-metrics?min_matches=20",
  );
  assert.equal(
    canonicalAnalyticsHref("/analytics/items?tab=item-purchase-analysis"),
    "/analytics/items/item-purchase-analysis",
  );
});

test("explicit view paths win over old tab parameters without changing detail pages", () => {
  assert.equal(
    canonicalAnalyticsHref("/analytics/heroes/by-duration?tab=stats-by-rank&hero_stat=winrate"),
    "/analytics/heroes/by-duration?hero_stat=winrate",
  );
  assert.equal(canonicalAnalyticsHref("/analytics/heroes?tab=unknown&date_range=_"), "/analytics/heroes?date_range=_");
  assert.equal(canonicalAnalyticsHref("/analytics/heroes/by-duration?hero_stat=winrate"), null);
  assert.equal(canonicalAnalyticsHref("/analytics/heroes/dynamo?tab=abilities"), null);
});
