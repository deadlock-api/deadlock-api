import assert from "node:assert/strict";
import { test } from "node:test";

import { PAGE_REGISTRY } from "~/lib/page-registry";

import { decideRequestBody, intentFromDecision, questionEntities } from "./decide";
import { findMentions, itemTiersOf } from "./entities";
import { directIntent, NO_FILTERS, type SearchIntent } from "./intent";
import { type Catalog, resolveIntent } from "./resolve";
import { validateDecideInput } from "./search-fns";

const catalog: Catalog = {
  heroes: [
    { id: 15, name: "Bebop", codename: "bebop" },
    { id: 13, name: "Haze", codename: "haze" },
    { id: 2, name: "Seven", codename: "gigawatt" },
    { id: 7, name: "Wraith", codename: "wraith" },
    { id: 6, name: "Abrams", codename: "atlas" },
    { id: 11, name: "Dynamo", codename: "dynamo" },
    { id: 35, name: "Grey Talon", codename: "orion" },
    { id: 18, name: "Mo & Krill", codename: "krill" },
    { id: 50, name: "The Doorman", codename: "doorman" },
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
};

const context = {
  patches: [
    { id: "2026-09-29", name: "City Never Sleeps", shortName: "City Never Sleeps", startUnix: 1_790_000_000 },
    { id: "2026-09-16", name: "Minor Update", shortName: "Patch", startUnix: 1_789_000_000, endUnix: 1_790_000_000 },
  ],
  seasons: [{ startUnix: 1_780_000_000 }],
  now: Date.UTC(2026, 9, 8, 12) / 1000,
};

const vocabulary = {
  heroNames: catalog.heroes.map((hero) => hero.name),
  itemNames: catalog.items.map((item) => item.name),
  rankNames: catalog.ranks.map((rank) => rank.name),
};

const intent = (page: string, rest: Partial<SearchIntent> = {}): SearchIntent => ({ ...NO_FILTERS, ...rest, page });
const url = (i: SearchIntent) => {
  const target = resolveIntent(i, catalog, context);
  return target && target.path + JSON.stringify(target.search);
};
const searchOf = (i: SearchIntent) => resolveIntent(i, catalog, context)?.search;

test("names are found as players write them: nicknames, typos, any case", () => {
  const names = (q: string) => findMentions(q, vocabulary.heroNames).map((m) => m.name);
  assert.deepEqual(names("gt vs mo krill"), ["Grey Talon", "Mo & Krill"]);
  assert.deepEqual(names("bebpo counters"), ["Bebop"]);
  assert.deepEqual(names("is doorman op"), ["The Doorman"]);
  // Short names take no typos: "have" is not "Haze".
  assert.deepEqual(names("what items should i have"), []);
  assert.deepEqual(
    findMentions("toxic bullet timing", vocabulary.itemNames).map((m) => m.name),
    ["Toxic Bullets"],
  );
});

test("a vs splits the heroes into two teams", () => {
  assert.deepEqual(questionEntities("seven wraith vs abrams", vocabulary), {
    heroes: ["Seven", "Wraith"],
    enemies: ["Abrams"],
    items: [],
  });
});

test("the request asks for every registered page, and offers none for the page and each filter", () => {
  const body = decideRequestBody(
    "best counter against bebop",
    questionEntities("bebop", vocabulary),
    vocabulary.rankNames,
  );
  assert.deepEqual(Object.keys(body.questions.page.criteria), ["none", ...PAGE_REGISTRY.map((page) => page.id)]);
  for (const name of ["rank_min", "rank_max", "mode", "time", "region", "sort"]) {
    assert.ok("none" in body.questions[name].criteria, name);
  }
});

const choice = (probabilities: Record<string, number>) => ({
  choice: Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0][0],
  probabilities,
});

test("a decision becomes the likeliest page and the filters the question set", () => {
  const question = "phantom+ wraith vs haze ranked this patch";
  const entities = questionEntities(question, vocabulary);
  const decided = intentFromDecision(
    {
      page: choice({ hero_counters: 0.7, hero_matchups: 0.2, tier_list: 0.06, abilities: 0.04 }),
      rank_min: choice({ Phantom: 0.9, none: 0.1 }),
      rank_max: choice({ Phantom: 0.6, none: 0.4 }),
      mode: choice({ ranked: 0.8, none: 0.2 }),
      time: choice({ current_patch: 0.9, none: 0.1 }),
    },
    question,
    entities,
    vocabulary.rankNames,
  );
  assert.deepEqual(decided, {
    ...NO_FILTERS,
    page: "hero_counters",
    // Not the team builder: both heroes belong to the one question.
    heroes: ["Wraith", "Haze"],
    rank_min: "Phantom",
    // "phantom+" is open upwards, whatever the model picked as the top.
    rank_max: null,
    mode: "ranked",
    time: "current_patch",
  });
});

test("an item question with a vs keeps both sides: what to buy as one hero against the other", () => {
  const question = "which item should i buy as haze versus a bebop?";
  const decided = intentFromDecision(
    { page: choice({ item_stats: 0.8, hero_counters: 0.2 }) },
    question,
    questionEntities(question, vocabulary),
    vocabulary.rankNames,
  );
  assert.deepEqual([decided.heroes, decided.enemy_heroes], [["Haze"], ["Bebop"]]);
  assert.equal(url(decided), '/analytics/items{"hero":13,"enemy":15}');
});

test("shop tiers are read in code and narrow the item table", () => {
  const question = "t1 items as bebop against haze";
  const decided = intentFromDecision(
    { page: choice({ item_stats: 0.9, none: 0.1 }) },
    question,
    questionEntities(question, vocabulary),
    vocabulary.rankNames,
  );
  assert.equal(url(decided), '/analytics/items{"hero":15,"enemy":13,"item_tiers":1}');
  assert.deepEqual(itemTiersOf("tier 3 and 4 items on haze"), [3, 4]);
  assert.deepEqual(itemTiersOf("best T2/t1 items"), [1, 2]);
  assert.deepEqual(itemTiersOf("tier one weapon items"), [1]);
  assert.deepEqual(itemTiersOf("haze tier list"), []);
  assert.deepEqual(itemTiersOf("is bebop s tier"), []);
});

test("a question the model cannot place opens nothing", () => {
  const entities = questionEntities("test", vocabulary);
  const decide = (page: Record<string, number>) =>
    intentFromDecision({ page: choice(page) }, "test", entities, vocabulary.rankNames).page;
  assert.equal(decide({ none: 0.94, tier_list: 0.04, hero_stats: 0.02 }), null);
  // Not "none", but no page it would stand behind either.
  assert.equal(decide({ tier_list: 0.45, hero_stats: 0.35, none: 0.2 }), null);
  assert.equal(decide({ tier_list: 0.6, none: 0.4 }), "tier_list");
});

test("items against several heroes take them all as the enemy, one id stays a number", () => {
  const question = "best item against mo krill and bebop";
  const decided = intentFromDecision(
    { page: choice({ item_stats: 0.9, none: 0.1 }) },
    question,
    questionEntities(question, vocabulary),
    vocabulary.rankNames,
  );
  assert.equal(url(decided), '/analytics/items{"enemy":"18,15"}');
  assert.equal(
    url(intent("hero_synergy", { heroes: ["Bebop"] })),
    '/analytics/heroes/combos{"comb_include_heroes":15}',
  );
});

test("a mode the question does not name is dropped", () => {
  const question = "best heroes in eternus";
  const decided = intentFromDecision(
    { page: choice({ tier_list: 1 }), mode: choice({ ranked: 0.9, none: 0.1 }) },
    question,
    questionEntities(question, vocabulary),
    vocabulary.rankNames,
  );
  assert.equal(decided.mode, null);
});

test("the example questions land on their pages", () => {
  assert.equal(
    url(intent("games_overview", { time: "current_patch" })),
    '/analytics/games{"date_range":"2026-09-21T14:13:20.000Z_"}',
  );
  assert.equal(url(intent("hero_counters", { heroes: ["Bebop"] })), '/analytics/heroes/matchup-details{"hero_id":15}');
  assert.equal(url({ ...NO_FILTERS, page: null }), undefined);
});

test("rank tiers become a badge range, a one-sided one open at the other end", () => {
  const search = (rank_min: string | null, rank_max: string | null) =>
    searchOf(intent("hero_stats", { rank_min, rank_max }));
  assert.deepEqual(search("Phantom", null), { min_rank: 91, max_rank: 116 });
  assert.deepEqual(search(null, "Phantom"), { min_rank: 0, max_rank: 96 });
  assert.deepEqual(search("Eternus", "Phantom"), { min_rank: 91, max_rank: 116 });
  assert.deepEqual(search(null, null), {});
});

test("the team builder fills each team's slots, four a side in Street Brawl", () => {
  const draft = intent("team_builder", { heroes: ["Seven", "Wraith"], enemy_heroes: ["Abrams"] });
  assert.deepEqual(searchOf(draft), { ally: "2,7,0,0,0,0", enemy: "6,0,0,0,0,0" });
  assert.equal(searchOf({ ...draft, mode: "street_brawl" })?.ally, "2,7,0,0");
});

test("a bare hero or item name skips the model", () => {
  assert.deepEqual(directIntent(" grey talon ", vocabulary)?.heroes, ["Grey Talon"]);
  assert.equal(directIntent("Healbane", vocabulary)?.page, "item_page");
  // Nicknames count, and are measured in the matcher's own words: "mo krill" is the whole question.
  assert.deepEqual(directIntent("mo krill", vocabulary)?.heroes, ["Mo & Krill"]);
  assert.equal(directIntent("gt build", vocabulary), undefined);
  assert.equal(directIntent("best counter against bebop", vocabulary), undefined);
});

test("the server takes only a short question and a few short names", () => {
  const ok = {
    question: "bebop counters",
    entities: { heroes: ["Bebop"], enemies: [], items: [] },
    rankNames: ["Phantom"],
  };
  assert.deepEqual(validateDecideInput(ok).entities.heroes, ["Bebop"]);
  assert.throws(() => validateDecideInput({ ...ok, question: "x".repeat(201) }));
  assert.throws(() => validateDecideInput({ ...ok, question: "  " }));
  assert.throws(() => validateDecideInput({ ...ok, entities: { ...ok.entities, heroes: Array(13).fill("a") } }));
  assert.throws(() => validateDecideInput({ ...ok, rankNames: ["x".repeat(41)] }));
});
