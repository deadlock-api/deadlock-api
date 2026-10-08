import type { QueryClient } from "@tanstack/react-query";

import { intentFromDecision, questionEntities } from "~/lib/ai-search/decide";
import { directIntent, type IntentVocabulary } from "~/lib/ai-search/intent";
import { type Catalog, resolveIntent } from "~/lib/ai-search/resolve";
import { decideSearch } from "~/lib/ai-search/search-fns";
import { PATCHES } from "~/lib/constants";
import type { ResolveContext } from "~/lib/page-registry";
import { toPatchEntry } from "~/lib/patches";
import { stringifySearch } from "~/lib/search-params";
import {
  filterPlayableHeroes,
  filterShopableItems,
  heroesQueryOptions,
  itemUpgradesQueryOptions,
  loadSeasons,
} from "~/queries/asset-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";

// The search's work, loaded on its first question so the field in every page's sidebar costs no more than a field.

interface SearchCatalog {
  vocabulary: IntentVocabulary;
  catalog: Catalog;
  context: Omit<ResolveContext, "now">;
}

const PATCH_ENTRIES = PATCHES.map(toPatchEntry);

/** The catalog of the cached hero list, kept while that list is: the name matcher caches its work per name list. */
const catalogs = new WeakMap<object, SearchCatalog>();

/** The names and time windows a question is read against, from the asset caches every page warms. */
async function loadSearchCatalog(queryClient: QueryClient): Promise<SearchCatalog> {
  const [heroes, items, ranks, seasons] = await Promise.all([
    queryClient.query({ ...heroesQueryOptions, staleTime: "static" }),
    queryClient.query({ ...itemUpgradesQueryOptions, staleTime: "static" }),
    queryClient.query({ ...ranksQueryOptions, staleTime: "static" }),
    loadSeasons(queryClient),
  ]);
  const cached = catalogs.get(heroes);
  if (cached && cached.catalog.ranks === ranks) return cached;
  const playable = filterPlayableHeroes(heroes);
  const shopable = filterShopableItems(items);
  const built: SearchCatalog = {
    vocabulary: {
      heroNames: playable.map((hero) => hero.name),
      itemNames: shopable.map((item) => item.name),
      rankNames: ranks.map((rank) => rank.name),
    },
    catalog: { heroes: playable, items: shopable, ranks },
    context: {
      patches: PATCH_ENTRIES,
      seasons: seasons.map((season) => ({ startUnix: season.startDate.unix(), endUnix: season.endDate?.unix() })),
    },
  };
  catalogs.set(heroes, built);
  return built;
}

interface RoutedQuestion {
  /** The page that answers the question, opened with its heroes and filters; missing when nothing does. */
  result?: { id: string; href: string };
  /** The question was a bare hero or item name, answered without the model. */
  direct: boolean;
  /** How long the answer took, catalogs and model together. */
  durationMs: number;
}

export async function routeQuestion(queryClient: QueryClient, question: string): Promise<RoutedQuestion> {
  const startedAt = performance.now();
  const { vocabulary, catalog, context } = await loadSearchCatalog(queryClient);
  let intent = directIntent(question, vocabulary);
  const direct = intent !== undefined;
  if (!intent) {
    const entities = questionEntities(question, vocabulary);
    const answers = await decideSearch({ data: { question, entities, rankNames: [...vocabulary.rankNames] } });
    intent = intentFromDecision(answers, question, entities, vocabulary.rankNames);
  }
  const target = resolveIntent(intent, catalog, { ...context, now: Date.now() / 1000 });
  return {
    result: target && { id: target.page.id, href: target.path + stringifySearch(target.search) },
    direct,
    durationMs: performance.now() - startedAt,
  };
}
