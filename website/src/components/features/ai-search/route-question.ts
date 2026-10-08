import type { QueryClient } from "@tanstack/react-query";

import { buildIntentSchema, directIntent, type IntentVocabulary, parseIntent } from "~/lib/ai-search/intent";
import { askModel } from "~/lib/ai-search/language-model";
import { resolveIntent } from "~/lib/ai-search/resolve";
import { PATCHES } from "~/lib/constants";
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

/** The page a question leads to, as a site-relative href; `undefined` when the model found no page for it. */
export async function routeQuestion(
  queryClient: QueryClient,
  question: string,
  options: { signal: AbortSignal; onProgress: (loaded: number) => void },
): Promise<string | undefined> {
  const [heroes, items, ranks, seasons] = await Promise.all([
    queryClient.query({ ...heroesQueryOptions, staleTime: "static" }),
    queryClient.query({ ...itemUpgradesQueryOptions, staleTime: "static" }),
    queryClient.query({ ...ranksQueryOptions, staleTime: "static" }),
    queryClient.query({ ...rankedSeasonsQueryOptions, staleTime: "static" }),
  ]);
  const playable = filterPlayableHeroes(heroes);
  const shopable = filterShopableItems(items);
  const vocabulary: IntentVocabulary = {
    heroNames: playable.map((hero) => hero.name),
    itemNames: shopable.map((item) => item.name),
    rankNames: ranks.map((rank) => rank.name),
  };

  const intent =
    directIntent(question, vocabulary) ??
    parseIntent(await askModel(question, buildIntentSchema(vocabulary), options), vocabulary);
  if (!intent) return undefined;

  const target = resolveIntent(intent, {
    heroes: playable,
    items: shopable,
    ranks,
    patches: PATCHES.map(toPatchEntry),
    seasons: seasons.map((season) => ({ startUnix: season.startDate.unix(), endUnix: season.endDate?.unix() })),
    now: Date.now() / 1000,
  });
  return target.path + stringifySearch(target.search);
}
