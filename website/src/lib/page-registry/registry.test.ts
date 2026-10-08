import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { HERO_SORT_BY_VALUES, ALL_SORT_BY_VALUES } from "../../components/domain/player-scoreboard/sort-options";
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
  const withHero = { ...empty, heroes: [{ id: 35, name: "Grey Talon" }] };
  assert.equal(resolvePage(heroPage, withHero, context).path, "/analytics/heroes/grey-talon");
  const patchNotes = PAGE_REGISTRY.find((page) => page.id === "patch_notes")!;
  assert.equal(resolvePage(patchNotes, { ...empty, time: "previous_patch" }, context).path, "/patches/2026-09-16");
});

test("a combination holds every hero named", () => {
  const combos = PAGE_REGISTRY.find((page) => page.id === "hero_synergy")!;
  const heroes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Hero ${i + 1}` }));
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
  const bebop = { ...empty, heroes: [{ id: 15, name: "Bebop" }] };
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
