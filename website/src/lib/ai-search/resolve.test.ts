import assert from "node:assert/strict";
import { test } from "node:test";

import { buildIntentSchema, directIntent, NO_FILTERS, parseIntent, type SearchIntent } from "./intent";
import { PAGE_IDS } from "./pages";
import { initialPrompts } from "./prompt";
import { type ResolveContext, resolveIntent } from "./resolve";

const context: ResolveContext = {
  heroes: [
    { id: 15, name: "Bebop" },
    { id: 13, name: "Haze" },
    { id: 2, name: "Seven" },
    { id: 7, name: "Wraith" },
    { id: 6, name: "Abrams" },
    { id: 11, name: "Dynamo" },
    { id: 35, name: "Grey Talon" },
  ],
  items: [
    { id: 100, name: "Toxic Bullets" },
    { id: 101, name: "Healbane" },
  ],
  ranks: [
    { tier: 0, name: "Obscurus" },
    { tier: 9, name: "Phantom" },
    { tier: 11, name: "Eternus" },
  ],
  patches: [
    { id: "2026-09-29", name: "City Never Sleeps", shortName: "City Never Sleeps", startUnix: 1_790_000_000 },
    { id: "2026-09-16", name: "Minor", shortName: "Patch", startUnix: 1_789_000_000, endUnix: 1_790_000_000 },
  ],
  seasons: [{ startUnix: 1_780_000_000 }],
  now: Date.UTC(2026, 9, 8, 12) / 1000,
};

const vocabulary = {
  heroNames: context.heroes.map((hero) => hero.name),
  itemNames: context.items.map((item) => item.name),
  rankNames: context.ranks.map((rank) => rank.name),
};

test("the two example questions land on their pages", () => {
  assert.deepEqual(resolveIntent({ ...NO_FILTERS, page: "team_sides", time: "current_patch" }, context), {
    path: "/analytics/games",
    search: { date_range: "2026-09-21T14:13:20.000Z_" },
  });
  assert.deepEqual(resolveIntent({ ...NO_FILTERS, page: "hero_counters", heroes: ["Bebop"] }, context), {
    path: "/analytics/heroes/matchup-details",
    search: { hero_id: 15 },
  });
});

test("a hero or item page is addressed by its slug", () => {
  assert.equal(
    resolveIntent({ ...NO_FILTERS, page: "hero_page", heroes: ["Grey Talon"] }, context).path,
    "/analytics/heroes/grey-talon",
  );
  assert.equal(
    resolveIntent({ ...NO_FILTERS, page: "item_page", items: ["Toxic Bullets"] }, context).path,
    "/analytics/items/toxic-bullets",
  );
  // Without the entity, the list it belongs to.
  assert.equal(resolveIntent({ ...NO_FILTERS, page: "hero_page" }, context).path, "/analytics/heroes");
});

test("rank tiers become a badge range, a one-sided one open at the other end", () => {
  const search = (rank_min: string | null, rank_max: string | null) =>
    resolveIntent({ ...NO_FILTERS, page: "hero_stats", rank_min, rank_max }, context).search;
  assert.deepEqual(search("Phantom", null), { min_rank: 91, max_rank: 116 });
  assert.deepEqual(search(null, "Phantom"), { min_rank: 0, max_rank: 96 });
  assert.deepEqual(search("Eternus", "Phantom"), { min_rank: 91, max_rank: 116 });
  assert.deepEqual(search(null, null), {});
});

test("a mode without ranks drops the rank range", () => {
  const { search } = resolveIntent(
    { ...NO_FILTERS, page: "hero_stats", mode: "street_brawl", rank_min: "Phantom" },
    context,
  );
  assert.deepEqual(search, { game_mode: "street_brawl", match_mode: "unranked" });
});

test("time words become a date range", () => {
  const range = (time: SearchIntent["time"]) =>
    resolveIntent({ ...NO_FILTERS, page: "hero_stats", time }, context).search.date_range;
  assert.equal(range("previous_patch"), "2026-09-10T00:26:40.000Z_2026-09-21T14:13:20.000Z");
  assert.equal(range("last_7_days"), "2026-10-01_");
  assert.equal(range("previous_season"), undefined);
  assert.equal(range("default"), undefined);
});

test("pages that read no filters get none", () => {
  const intent = { ...NO_FILTERS, rank_min: "Phantom", time: "current_patch", mode: "ranked" } as const;
  assert.deepEqual(resolveIntent({ ...intent, page: "leaderboard", region: "Europe", heroes: ["Haze"] }, context), {
    path: "/community/leaderboard",
    search: { region: "Europe", hero_id: 13 },
  });
  assert.deepEqual(resolveIntent({ ...intent, page: "patch_notes", time: "previous_patch" }, context), {
    path: "/patches/2026-09-16",
    search: {},
  });
});

test("the team builder fills the slots of each team", () => {
  const { search } = resolveIntent(
    { ...NO_FILTERS, page: "team_builder", heroes: ["Seven", "Wraith"], enemy_heroes: ["Abrams"] },
    context,
  );
  assert.equal(search.ally, "2,7,0,0,0,0");
  assert.equal(search.enemy, "6,0,0,0,0,0");
});

test("model output off the vocabulary is dropped, an unknown page refused", () => {
  const raw = JSON.stringify({ page: "hero_counters", heroes: ["bebop", "Gandalf"], rank_min: "phantom", mode: "x" });
  assert.deepEqual(parseIntent(raw, vocabulary), {
    ...NO_FILTERS,
    page: "hero_counters",
    heroes: ["Bebop"],
    rank_min: "Phantom",
  });
  assert.equal(parseIntent(JSON.stringify({ page: "answer" }), vocabulary), undefined);
  assert.equal(parseIntent("Bebop is countered by Haze", vocabulary), undefined);
});

test("every few-shot answer matches the schema's pages and parses back to itself", () => {
  const schema = buildIntentSchema(vocabulary);
  assert.deepEqual(schema.properties.page.enum, PAGE_IDS);
  for (const message of initialPrompts().filter((m) => m.role === "assistant")) {
    assert.deepEqual(parseIntent(message.content, vocabulary), JSON.parse(message.content));
  }
});

test("a bare hero or item name skips the model", () => {
  assert.deepEqual(directIntent(" grey talon ", vocabulary), {
    ...NO_FILTERS,
    page: "hero_page",
    heroes: ["Grey Talon"],
  });
  assert.deepEqual(directIntent("Healbane", vocabulary), { ...NO_FILTERS, page: "item_page", items: ["Healbane"] });
  assert.equal(directIntent("best counter against bebop", vocabulary), undefined);
});
