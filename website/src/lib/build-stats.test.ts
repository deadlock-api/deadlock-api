import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildAbilityOrder,
  buildAdherence,
  buildCategoryName,
  buildItemPresence,
  buildItemUsage,
  buildMatchesItems,
  buildMatchesMeta,
  type BuildMeta,
  buildRows,
  buildSlotCost,
  buildUnlockOrder,
  buildTrends,
  distinguishingItems,
  summarizeBuilds,
} from "./build-stats";

const stat = (id: number, wins: number, losses: number) => ({
  hero_build_id: id,
  wins,
  losses,
  matches: wins + losses,
  players: wins + losses,
});

const meta = (buildId: number, itemIds: number[]): BuildMeta => ({
  buildId,
  name: `Build ${buildId}`,
  authorId: 1,
  version: 1,
  updatedAt: 0,
  language: 0,
  tags: [],
  categories: [{ name: "", description: null, itemIds, notes: {} }],
  abilityOrder: [],
});

test("a build is above or below average only when its whole interval is", () => {
  const rows = buildRows([stat(1, 700, 300), stat(2, 300, 700), stat(3, 6, 4)]);
  assert.deepEqual(
    rows.map((row) => row.verdict),
    ["above", "below", "even"],
  );
  assert.equal(rows[0].share, 1000 / 2010);
});

test("the summary pools the builds and takes the most played one's share", () => {
  const summary = summarizeBuilds(buildRows([stat(1, 8, 2), stat(2, 600, 400)]));
  assert.equal(summary.matches, 1010);
  assert.equal(summary.topShare, 1000 / 1010);
});

test("item presence is weighted by matches and compared with the builds without the item", () => {
  const rows = buildRows(
    [stat(1, 60, 40), stat(2, 40, 60)],
    new Map([
      [1, meta(1, [10, 20, 10])],
      [2, meta(2, [20])],
    ]),
  );
  const [shared, only] = buildItemPresence(rows);
  assert.deepEqual(shared, { itemId: 20, builds: 2, share: 1, winRate: 0.5, vsWithout: null });
  assert.equal(only.itemId, 10);
  assert.equal(only.share, 0.5);
  assert.ok(Math.abs(only.vsWithout! - 0.2) < 1e-9);
});

test("category keys read as the game names them", () => {
  assert.equal(buildCategoryName("#Citadel_HeroBuilds_EarlyGame"), "Early Game");
  assert.equal(buildCategoryName("#Citadel_HeroBuilds_Lane"), "Laning");
  assert.equal(buildCategoryName("#Citadel_HeroBuilds_SomethingNew"), "Something New");
  assert.equal(buildCategoryName("  "), null);
  assert.equal(buildCategoryName("CORE ITEMS"), "Core items");
  assert.equal(buildCategoryName("DPS"), "DPS");
  assert.equal(buildCategoryName("Ult build finish L->R"), "Ult build finish L->R");
});

test("a refund takes back the ability's last point", () => {
  const order = buildAbilityOrder([
    { ability_id: 1, currency_type: 2, delta: -1 },
    { ability_id: 2, currency_type: 2, delta: -1 },
    { ability_id: 1, currency_type: 1, delta: -1 },
    { ability_id: 1, currency_type: 1, delta: 1 },
    { ability_id: 2, currency_type: 1, delta: -1 },
  ]);
  assert.deepEqual(order, [1, 2, 2]);
});

test("the distinguishing items leave out the ones nearly every build or almost no build lists", () => {
  const item = (itemId: number, share: number, vsWithout: number | null) => ({
    itemId,
    builds: 1,
    share,
    winRate: 0.5,
    vsWithout,
  });
  const items = distinguishingItems([item(1, 1, null), item(2, 0.5, -0.02), item(3, 0.3, 0.04), item(4, 0.05, 0.2)]);
  assert.deepEqual(
    items.map((i) => i.itemId),
    [3, 2],
  );
});

test("a trend compares a build's recent share with its share over the range, among the listed builds", () => {
  const rows = buildRows([stat(1, 30, 30), stat(2, 20, 20)]);
  const trends = buildTrends(rows, [
    { hero_build_id: 1, matches: 10 },
    { hero_build_id: 2, matches: 30 },
    { hero_build_id: 3, matches: 1000 },
  ]);
  assert.equal(trends.get(1)?.recentShare, 0.25);
  assert.ok(Math.abs(trends.get(1)!.change - (0.25 - 0.6)) < 1e-9);
  assert.equal(trends.get(2)?.recentMatches, 30);
  assert.equal(buildTrends(rows, []).size, 0);
});

test("item usage is the share of the build's matches that bought the item, and lists the unlisted favourites", () => {
  const purchase = (item_id: number, wins: number, matches: number) => ({
    item_id,
    wins,
    matches,
    avg_buy_time_s: 600,
    sold: matches / 2,
    avg_sell_time_s: 1200,
  });
  const { byItem, offBuild } = buildItemUsage(
    [purchase(1, 45, 90), purchase(2, 10, 15), purchase(3, 30, 50), purchase(4, 5, 10), purchase(5, 1, 0)],
    { wins: 55, matches: 100 },
    [1, 2],
  );
  assert.equal(byItem.get(1)?.boughtRate, 0.9);
  assert.equal(byItem.get(2)?.winRate, 10 / 15);
  assert.equal(byItem.get(1)?.soldRate, 0.5);
  assert.equal(byItem.get(1)?.winRateWithout, 10 / 10);
  assert.equal(byItem.get(2)?.winRateWithout, 45 / 85);
  assert.equal(byItem.has(5), false);
  assert.deepEqual(
    offBuild.map((usage) => usage.itemId),
    [3],
  );
});

test("adherence splits a build's matches into the ones that followed it and the rest", () => {
  assert.deepEqual(buildAdherence({ wins: 60, matches: 100 }, { wins: 45, matches: 75 }), {
    share: 0.75,
    winRate: 0.6,
    otherWinRate: 0.6,
  });
  assert.deepEqual(buildAdherence({ wins: 10, matches: 20 }, { wins: 0, matches: 0 }), {
    share: 0,
    winRate: null,
    otherWinRate: 0.5,
  });
  assert.equal(buildAdherence({ wins: 5, matches: 10 }, { wins: 6, matches: 11 }).otherWinRate, null);
  // Two matches that followed it are too few for a win rate.
  assert.equal(buildAdherence({ wins: 50, matches: 100 }, { wins: 2, matches: 2 }).winRate, null);
  assert.deepEqual(buildUnlockOrder([3, 3, 1, 2, 3, 4, 1]), [3, 1, 2, 4]);
});

test("a build's souls split by shop category, each listed item once", () => {
  const items = new Map([
    [10, { slot: "weapon", cost: 800 }],
    [20, { slot: "spirit", cost: 1600 }],
    [30, { slot: "vitality", cost: 500 }],
  ]);
  const build = meta(1, [10, 20, 10, 99]);
  assert.deepEqual(buildSlotCost(build, items), { total: 2400, bySlot: { weapon: 800, vitality: 0, spirit: 1600 } });
});

test("a build matches an item filter by what it lists", () => {
  const build = meta(1, [10, 20]);
  assert.equal(buildMatchesItems(build, [10], []), true);
  assert.equal(buildMatchesItems(build, [10, 30], []), false);
  assert.equal(buildMatchesItems(build, [], [20]), false);
  assert.equal(buildMatchesItems(undefined, [10], []), false);
  assert.equal(buildMatchesItems(undefined, [], []), true);
});

test("a build passes the tag, language and update filters only with all of them", () => {
  const build = { ...meta(1, []), tags: [7, 8], language: 8, updatedAt: 1_000 };
  const none = { withTags: [], withoutTags: [], language: null, updatedSince: null };
  assert.equal(buildMatchesMeta(build, { ...none, withTags: [7, 8] }), true);
  assert.equal(buildMatchesMeta(build, { ...none, withTags: [7, 9] }), false);
  assert.equal(buildMatchesMeta(build, { ...none, withoutTags: [8] }), false);
  assert.equal(buildMatchesMeta(build, { ...none, language: 8 }), true);
  assert.equal(buildMatchesMeta(build, { ...none, language: 0 }), false);
  assert.equal(buildMatchesMeta(build, { ...none, updatedSince: 1_000 }), true);
  assert.equal(buildMatchesMeta(build, { ...none, updatedSince: 1_001 }), false);
  assert.equal(buildMatchesMeta(undefined, { ...none, language: 0 }), false);
  assert.equal(buildMatchesMeta(undefined, none), true);
});
