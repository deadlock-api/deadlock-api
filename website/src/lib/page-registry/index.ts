import { sharedFilterParams } from "./filters";
import { COMMUNITY_PAGES } from "./sections/community";
import { GAME_PAGES } from "./sections/games";
import { HERO_PAGES } from "./sections/heroes";
import { ITEM_PAGES } from "./sections/items";
import { PLAYER_PAGES } from "./sections/players";
import type { RegisteredPage, ResolveContext, SearchValue, Selection, UnsearchablePage } from "./types";

export * from "./types";

/** Every page search can open, by section. A new page or tab registers itself in its section's file. */
export const PAGE_REGISTRY: readonly RegisteredPage[] = [
  ...HERO_PAGES,
  ...ITEM_PAGES,
  ...GAME_PAGES,
  ...PLAYER_PAGES,
  ...COMMUNITY_PAGES,
];

/**
 * Pages the registry leaves out on purpose; the registry test fails on a page route that is in neither list. A path
 * ending in `/*` covers everything below it.
 */
export const UNSEARCHABLE_PAGES: readonly UnsearchablePage[] = [
  { path: "/", reason: "the home page the search lives on" },
  { path: "/patron", reason: "an account page, not stats" },
  { path: "/ingest-cache", reason: "a tool for contributing match data, not stats" },
  { path: "/tracker/demo", reason: "a demo of the tracker, which is registered" },
  { path: "/tracker/players/$accountId", reason: "one player's profile, which needs their account" },
  { path: "/data-privacy", reason: "a legal page" },
  { path: "/deadlockstats-privacy", reason: "a legal page" },
  { path: "/blog", reason: "articles, not stats" },
  { path: "/blog/*", reason: "articles, not stats" },
  { path: "/auth/*", reason: "sign-in callbacks" },
  { path: "/dev/*", reason: "the design system showcase, dev only" },
  { path: "/streamkit/widgets/*", reason: "overlays a stream embeds, set up from the stream kit" },
  { path: "/games/deadlockdle/*", reason: "the rounds of Deadlockdle, which is registered" },
  { path: "/games/flashcards/*", reason: "the decks of the flashcards, which are registered" },
];

const BY_ID = new Map(PAGE_REGISTRY.map((page) => [page.id, page]));

export function registeredPage(id: string): RegisteredPage | undefined {
  return BY_ID.get(id);
}

/** Whether a page opens with two teams (the heroes asked about and the other team): "haze vs bebop" keeps both sides. */
export function readsEnemyTeam(page: RegisteredPage): boolean {
  return [...Object.values(page.pathParams ?? {}), ...Object.values(page.search ?? {})].some(
    (reader) => reader.uses === "enemyHeroes",
  );
}

export interface PageTarget {
  page: RegisteredPage;
  path: string;
  search: Record<string, SearchValue>;
}

/** Where a selection opens a page: its path with the segments filled, and every parameter the page reads. */
export function resolvePage(page: RegisteredPage, selection: Selection, context: ResolveContext): PageTarget {
  let path = page.path;
  for (const [name, reader] of Object.entries(page.pathParams ?? {})) {
    const value = reader.read(selection, context);
    if (value === undefined) return { page, path: page.fallbackPath ?? "/", search: {} };
    path = path.replace(`$${name}`, encodeURIComponent(String(value)));
  }
  const search: Record<string, SearchValue> = { ...page.fixed };
  for (const [param, reader] of Object.entries(page.search ?? {})) {
    const value = reader.read(selection, context);
    if (value !== undefined) search[param] = value;
  }
  return { page, path, search: { ...search, ...sharedFilterParams(page.filters ?? [], selection, context) } };
}
