import type { QueryClient } from "@tanstack/react-query";

import { buildSearchCatalog, type SearchCatalog } from "~/lib/ai-search/catalog";
import { intentFromDecision, questionEntities } from "~/lib/ai-search/decide";
import { describeIntent } from "~/lib/ai-search/describe";
import { findMentions, words } from "~/lib/ai-search/entities";
import { directIntent, NO_FILTERS } from "~/lib/ai-search/intent";
import { lookupOf, type PlayerLookup, playerLookupOf } from "~/lib/ai-search/lookup";
import { resolveIntent } from "~/lib/ai-search/resolve";
import { decideSearch } from "~/lib/ai-search/search-fns";
import { PATCHES } from "~/lib/constants";
import { isClientError } from "~/lib/http";
import type { SeasonRef } from "~/lib/page-registry";
import { toPatchEntry } from "~/lib/patches";
import { ensureCached } from "~/lib/prefetch-safe";
import { stringifySearch } from "~/lib/search-params";
import { heroesQueryOptions, itemUpgradesQueryOptions, loadSeasons } from "~/queries/asset-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";
import { steamSearchQueryOptions } from "~/queries/steam-queries";

// The search's work, loaded on its first question so the field in every page's sidebar costs no more than a field.

const PATCH_ENTRIES = PATCHES.map(toPatchEntry);

/** The names and time windows a question is read against, from the asset caches every page warms. */
async function loadSearchCatalog(queryClient: QueryClient): Promise<SearchCatalog & { seasons: SeasonRef[] }> {
  const [heroes, items, ranks, seasons] = await Promise.all([
    ensureCached(queryClient, heroesQueryOptions),
    ensureCached(queryClient, itemUpgradesQueryOptions),
    ensureCached(queryClient, ranksQueryOptions),
    loadSeasons(queryClient),
  ]);
  return {
    ...buildSearchCatalog(heroes, items, ranks),
    seasons: seasons.map((season) => ({ startUnix: season.startDate.unix(), endUnix: season.endDate?.unix() })),
  };
}

/**
 * The account a player lookup names: its Steam ID, else the Steam profile with exactly that name. The search is fuzzy
 * ("noob123" finds "Inoob132" first), so its top match would open someone else's tracker.
 */
async function findPlayer(queryClient: QueryClient, player: PlayerLookup): Promise<number | undefined> {
  if ("steamId3" in player) return player.steamId3;
  // The search answers 404 when no profile matches.
  const profiles = await ensureCached(queryClient, steamSearchQueryOptions(player.name)).catch((error: unknown) => {
    if (isClientError(error)) return [];
    throw error;
  });
  const name = player.name.toLowerCase();
  return profiles.find((profile) => profile.personaname.toLowerCase() === name)?.account_id;
}

/**
 * What a question came to: the page to open, a question no page answers, a player the Steam search does not know, a
 * question after one match (no page holds one), or a visitor who asked too much. A failed model call throws, like any
 * other failed request.
 */
type Routed =
  | { kind: "opened"; id: string; href: string; title: string; filters: string[]; heroId?: number }
  | { kind: "not_understood" }
  | { kind: "player_not_found" }
  | { kind: "match_lookup" }
  | { kind: "rate_limited" };

/** `direct`: a bare hero or item name, answered without the model. `durationMs`: catalogs and model together. */
export async function routeQuestion(
  queryClient: QueryClient,
  question: string,
): Promise<Routed & { direct: boolean; durationMs: number }> {
  const startedAt = performance.now();
  const { vocabulary, catalog, seasons } = await loadSearchCatalog(queryClient);
  let intent = directIntent(question, vocabulary);
  const direct = intent !== undefined;
  const done = (routed: Routed) => ({ ...routed, direct, durationMs: performance.now() - startedAt });
  if (!intent) {
    // One player opens their tracker page, which says how to unlock it when it is locked.
    const player = playerLookupOf(question);
    if (player) {
      const accountId = await findPlayer(queryClient, player);
      if (accountId === undefined) return done({ kind: "player_not_found" });
      return done({
        kind: "opened",
        id: "player-tracker",
        href: `/tracker/players/${accountId}`,
        title: "Player Tracker",
        filters: [],
      });
    }
    if (lookupOf(question) === "match") return done({ kind: "match_lookup" });
    const entities = questionEntities(question, vocabulary);
    const decided = await decideSearch({ data: { question, entities, rankNames: [...vocabulary.rankNames] } });
    if (!decided.ok && decided.reason === "rate_limited") return done({ kind: "rate_limited" });
    if (!decided.ok) throw new Error("The search model is unavailable");
    intent = intentFromDecision(decided.answers, question, entities, vocabulary.rankNames);
  }
  const target = resolveIntent(intent, catalog, { patches: PATCH_ENTRIES, seasons, now: Date.now() / 1000 });
  if (!target) return done({ kind: "not_understood" });
  // The hash points the page at what was asked (`FindOnPage` outlines it); it never reaches the server.
  const hash = target.find ? `#find:${target.find}` : "";
  return done({
    kind: "opened",
    id: target.page.id,
    href: target.path + stringifySearch(target.search) + hash,
    title: target.page.title,
    filters: describeIntent(intent),
    // The hero the question is about, whose portrait the suggestion shows.
    heroId: catalog.heroes.find((hero) => hero.name === intent.heroes[0])?.id,
  });
}

/** A hero page the search offers beside the page it routes to. */
export interface HeroSuggestion {
  id: number;
  name: string;
  href: string;
}

/**
 * The hero pages a question can mean, at most `limit`: heroes it names (nicknames and typos too, "who counters abrams")
 * and, while a name is still being typed, heroes one of its words starts ("ab", "lady g").
 */
export async function suggestHeroes(queryClient: QueryClient, question: string, limit = 3): Promise<HeroSuggestion[]> {
  const { vocabulary, catalog, seasons } = await loadSearchCatalog(queryClient);
  const typed = words(question);
  const last = typed.at(-1);
  const named = findMentions(question, vocabulary.heroNames).map((mention) => mention.name);
  const started =
    last && last.length >= 2
      ? vocabulary.heroNames.filter((name) => words(name).some((word) => word.startsWith(last)))
      : [];
  const context = { patches: PATCH_ENTRIES, seasons, now: Date.now() / 1000 };
  return [...new Set([...named, ...started])].slice(0, limit).flatMap((name) => {
    const hero = catalog.heroes.find((entity) => entity.name === name);
    const target = resolveIntent({ ...NO_FILTERS, page: "hero_page", heroes: [name] }, catalog, context);
    return hero && target ? [{ id: hero.id, name, href: target.path + stringifySearch(target.search) }] : [];
  });
}
