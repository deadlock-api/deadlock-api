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
  rankedSeasonsQueryOptions,
} from "~/queries/asset-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";

/** A page that answers the question, and where it opens with the question's heroes and filters. */
export interface SearchResult {
  id: string;
  href: string;
}

interface SearchCatalog {
  vocabulary: IntentVocabulary;
  catalog: Catalog;
  context: ResolveContext;
}

/** The names and time windows a question is read against, from the asset caches every page warms. */
async function loadSearchCatalog(queryClient: QueryClient): Promise<SearchCatalog> {
  const [heroes, items, ranks, seasons] = await Promise.all([
    queryClient.query({ ...heroesQueryOptions, staleTime: "static" }),
    queryClient.query({ ...itemUpgradesQueryOptions, staleTime: "static" }),
    queryClient.query({ ...ranksQueryOptions, staleTime: "static" }),
    queryClient.query({ ...rankedSeasonsQueryOptions, staleTime: "static" }),
  ]);
  const playable = filterPlayableHeroes(heroes);
  const shopable = filterShopableItems(items);
  return {
    vocabulary: {
      heroNames: playable.map((hero) => hero.name),
      itemNames: shopable.map((item) => item.name),
      rankNames: ranks.map((rank) => rank.name),
    },
    catalog: { heroes: playable, items: shopable, ranks },
    context: {
      patches: PATCHES.map(toPatchEntry),
      seasons: seasons.map((season) => ({ startUnix: season.startDate.unix(), endUnix: season.endDate?.unix() })),
      now: Date.now() / 1000,
    },
  };
}

export interface RoutedQuestion {
  /** The pages that answer the question, best first: the search opens the first. */
  results: SearchResult[];
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
  const results = resolveIntent(intent, catalog, context).map((target) => ({
    id: target.page.id,
    href: target.path + stringifySearch(target.search),
  }));
  return { results, direct, durationMs: performance.now() - startedAt };
}
