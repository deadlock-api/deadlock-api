import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { HERO_SORT_BY_VALUES, ALL_SORT_BY_VALUES } from "~/lib/scoreboard-sorts";

import { ANALYTICS_TABS, analyticsTabPath, type AnalyticsSection, type AnalyticsTab } from "../analytics-tabs";
import { ALL_STAT_KEYS } from "../game-stat-definitions";
import { PAGE_REGISTRY, resolvePage, UNSEARCHABLE_PAGES } from "./index";
import { SORT_KEYS, type Selection } from "./types";

const ROUTES = path.join(import.meta.dirname, "../../routes");

/**
 * Every route file that renders a page, by the URL it is served at. Redirect-only routes have no component of their
 * own and no shared page options to bring one.
 */
function pageRoutes(): string[] {
  const files = fs.readdirSync(ROUTES, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".tsx"));
  return files.flatMap((file) => {
    const source = fs.readFileSync(path.join(ROUTES, file), "utf8");
    const declared = /createFileRoute\("([^"]+)"\)/.exec(source)?.[1];
    const rendersPage = /\bcomponent:|\.\.\.\w+Options\b/.test(source);
    if (!declared || !rendersPage || source.includes("redirectLegacyPage")) return [];
    // `games_/x` is a route out of its parent's layout, served at `games/x`.
    const url = declared.replaceAll("_/", "/").replace(/(.)\/$/, "$1");
    return [url];
  });
}

function covered(url: string): boolean {
  return (
    PAGE_REGISTRY.some((page) => page.path === url || page.fallbackPath === url) ||
    UNSEARCHABLE_PAGES.some(({ path: p }) => (p.endsWith("/*") ? url.startsWith(p.slice(0, -1)) : p === url))
  );
}

test("every page of the site is registered for search or left out on purpose", () => {
  const missing = pageRoutes().filter((url) => !covered(url));
  assert.deepEqual(missing, [], "register these pages in src/lib/page-registry/sections, or list them as unsearchable");
});

test("every analytics tab is registered", () => {
  for (const section of Object.keys(ANALYTICS_TABS) as AnalyticsSection[]) {
    for (const tab of Object.keys(ANALYTICS_TABS[section]) as AnalyticsTab<typeof section>[]) {
      const url = analyticsTabPath(section, tab);
      assert.ok(
        PAGE_REGISTRY.some((page) => page.path === url),
        `${url} is not registered`,
      );
    }
  }
});

test("page ids are unique and every page says what it shows", () => {
  const ids = PAGE_REGISTRY.map((page) => page.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const page of PAGE_REGISTRY) {
    assert.match(page.id, /^[a-z][a-z_]*$/, page.id);
    assert.ok(page.description.length > 20, page.id);
    for (const name of page.path.match(/\$(\w+)/g) ?? []) {
      assert.ok(page.pathParams?.[name.slice(1)], `${page.id} has no reader for ${name}`);
      assert.ok(page.fallbackPath, `${page.id} needs a fallbackPath for when ${name} is missing`);
    }
  }
});

const context = {
  patches: [
    { id: "2026-09-29", name: "City Never Sleeps", shortName: "City Never Sleeps", startUnix: 1_790_000_000 },
    { id: "2026-09-16", name: "Minor Update", shortName: "Patch", startUnix: 1_789_000_000, endUnix: 1_790_000_000 },
  ],
  seasons: [],
  now: 1_791_000_000,
};
const empty: Selection = { heroes: [], enemyHeroes: [], items: [] };

test("a page reads only the filters it lists", () => {
  const selection: Selection = { ...empty, rank: { min: 91, max: 116 }, mode: "ranked", time: "current_patch" };
  const leaderboard = PAGE_REGISTRY.find((page) => page.id === "leaderboard")!;
  assert.deepEqual(resolvePage(leaderboard, selection, context).search, {});
  const tierList = PAGE_REGISTRY.find((page) => page.id === "tier_list")!;
  assert.deepEqual(resolvePage(tierList, selection, context).search, {
    game_mode: "normal",
    match_mode: "ranked",
    min_rank: 91,
    max_rank: 116,
    date_range: "2026-09-21T14:13:20.000Z_",
  });
});

test("a path segment without its entity falls back to the list page", () => {
  const heroPage = PAGE_REGISTRY.find((page) => page.id === "hero_page")!;
  assert.equal(resolvePage(heroPage, empty, context).path, "/analytics/heroes");
  const withHero = { ...empty, heroes: [{ id: 35, name: "Grey Talon", codename: "orion" }] };
  assert.equal(resolvePage(heroPage, withHero, context).path, "/analytics/heroes/grey-talon");
  const patchNotes = PAGE_REGISTRY.find((page) => page.id === "patch_notes")!;
  assert.equal(resolvePage(patchNotes, { ...empty, time: "previous_patch" }, context).path, "/patches/2026-09-16");
});

test("a combination holds every hero named", () => {
  const combos = PAGE_REGISTRY.find((page) => page.id === "hero_synergy")!;
  const heroes = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Hero ${i + 1}`, codename: `hero${i + 1}` }));
  assert.deepEqual(resolvePage(combos, { ...empty, heroes: heroes(2) }, context).search, {
    comb_include_heroes: "1,2",
  });
  assert.deepEqual(resolvePage(combos, { ...empty, heroes: heroes(3) }, context).search, {
    comb_include_heroes: "1,2,3",
    comb_size: 3,
  });
  assert.equal(resolvePage(combos, { ...empty, heroes: heroes(7) }, context).search.comb_size, 6);
});

test("a page with tabs opens on its tab", () => {
  const conversations = PAGE_REGISTRY.find((page) => page.id === "hero_conversations")!;
  const bebop = { ...empty, heroes: [{ id: 15, name: "Bebop", codename: "bebop" }] };
  assert.deepEqual(resolvePage(conversations, bebop, context).search, { tab: "conversations", heroes: 15 });
});

test("every sort a page is sent is one the page offers", () => {
  const offered: Record<string, readonly string[]> = {
    hero_scoreboard: HERO_SORT_BY_VALUES,
    player_scoreboard: ALL_SORT_BY_VALUES,
    games_over_time: ALL_STAT_KEYS,
  };
  for (const [id, values] of Object.entries(offered)) {
    const page = PAGE_REGISTRY.find((p) => p.id === id)!;
    for (const sort of SORT_KEYS) {
      for (const [param, reader] of Object.entries(page.search ?? {})) {
        if (reader.uses !== "sort") continue;
        const value = reader.read({ ...empty, sort }, context);
        if (value !== undefined) assert.ok(values.includes(String(value)), `${id} ${param}=${value} for ${sort}`);
      }
    }
  }
  const heroes = PAGE_REGISTRY.find((p) => p.id === "hero_scoreboard")!;
  assert.equal(
    resolvePage(heroes, { ...empty, sort: "max_health" }, context).search.scoreboard_sort_by,
    "avg_max_health_per_match",
  );
});

test("a hero's voice lines open by the hero's codename", () => {
  const voice = PAGE_REGISTRY.find((page) => page.id === "voice_lines")!;
  const baba = { ...empty, heroes: [{ id: 81, name: "Baba", codename: "baba" }] };
  assert.deepEqual(resolvePage(voice, baba, context).search, { character: "baba" });
});

test("a page points at the spot that shows the asked stat", () => {
  const games = PAGE_REGISTRY.find((page) => page.id === "games_overview")!;
  const below = { ...empty, rank: { min: 0, max: 86 }, sort: "duration" as const };
  assert.deepEqual(resolvePage(games, below, context), {
    page: games,
    path: "/analytics/games",
    search: { min_rank: 0, max_rank: 86 },
    find: "stat-avg_duration_s",
  });
  assert.equal(resolvePage(games, empty, context).find, undefined);
});

/** Pages with nothing for a question to point at, and why; every other page must declare `find`. */
const NOTHING_TO_FIND: Record<string, string> = {
  heroes_over_time: "a chart, no element per hero",
  heroes_by_rank: "a chart, no element per hero",
  heroes_by_duration: "a chart, no element per hero",
  hero_synergy: "rows are combinations of heroes, not one hero",
  item_combos: "rows are combinations of items, not one item",
  item_timing: "a chart per item",
  build_flow: "a flow graph",
  abilities: "an ability order per hero, already filtered to it",
  games_over_time: "a chart of the stat the question picks",
  games_by_rank: "a chart per rank",
  games_economy: "charts of the soul economy",
  games_combat: "charts of combat stats",
  games_buffs: "charts of buff pickups",
  player_stats: "distribution charts",
  player_compare: "players the visitor adds",
  team_builder: "the draft itself is the answer",
  leaderboard: "rows are players, a hero is a filter",
  rank_distribution: "a chart",
  heatmap: "a map",
  patch_notes: "notes, not stats",
  voice_lines: "opens on the hero's lines",
  hero_conversations: "filtered to the hero",
  sound_effects: "a sound library",
  crosshair: "an editor",
  streamkit: "a setup page",
  data_dumps: "downloads",
  ingest_cache: "instructions, not stats",
  deadlockdle: "a game",
  flashcards: "a game",
};

test("every page says what a question can point at on it, or why nothing", () => {
  for (const page of PAGE_REGISTRY) {
    assert.ok(page.find || NOTHING_TO_FIND[page.id], `${page.id} declares no find and is not in NOTHING_TO_FIND`);
    assert.ok(!(page.find && NOTHING_TO_FIND[page.id]), `${page.id} declares a find but is listed without one`);
  }
});

test("a question points at the hero, item or stat it is about", () => {
  const page = (id: string) => PAGE_REGISTRY.find((p) => p.id === id)!;
  const bebop = { id: 15, name: "Bebop", codename: "bebop" };
  const haze = { id: 13, name: "Haze", codename: "haze" };
  assert.equal(resolvePage(page("tier_list"), { ...empty, heroes: [haze] }, context).find, "hero-13");
  // On a hero's counters, the hero asked about is the page; the other one is the row.
  assert.equal(resolvePage(page("hero_counters"), { ...empty, heroes: [bebop, haze] }, context).find, "hero-13");
  assert.equal(
    resolvePage(page("hero_page"), { ...empty, heroes: [haze], sort: "winrate" }, context).find,
    "stat-win_rate",
  );
  assert.equal(
    resolvePage(page("hero_scoreboard"), { ...empty, sort: "max_health" }, context).find,
    "stat-avg_max_health_per_match",
  );
  assert.equal(
    resolvePage(page("item_stats"), { ...empty, items: [{ id: 100, name: "Toxic Bullets" }] }, context).find,
    "item-100",
  );
});
