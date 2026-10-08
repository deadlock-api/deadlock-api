import type { QueryClient } from "@tanstack/react-query";

import { buildSearchCatalog, type SearchCatalog } from "~/lib/ai-search/catalog";
import { intentFromDecision, questionEntities } from "~/lib/ai-search/decide";
import { directIntent } from "~/lib/ai-search/intent";
import { resolveIntent } from "~/lib/ai-search/resolve";
import { decideSearch } from "~/lib/ai-search/search-fns";
import { PATCHES } from "~/lib/constants";
import type { SeasonRef } from "~/lib/page-registry";
import { toPatchEntry } from "~/lib/patches";
import { stringifySearch } from "~/lib/search-params";
import { heroesQueryOptions, itemUpgradesQueryOptions, loadSeasons } from "~/queries/asset-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";

// The search's work, loaded on its first question so the field in every page's sidebar costs no more than a field.

const PATCH_ENTRIES = PATCHES.map(toPatchEntry);

/** The names and time windows a question is read against, from the asset caches every page warms. */
async function loadSearchCatalog(queryClient: QueryClient): Promise<SearchCatalog & { seasons: SeasonRef[] }> {
  const [heroes, items, ranks, seasons] = await Promise.all([
    queryClient.query({ ...heroesQueryOptions, staleTime: "static" }),
    queryClient.query({ ...itemUpgradesQueryOptions, staleTime: "static" }),
    queryClient.query({ ...ranksQueryOptions, staleTime: "static" }),
    loadSeasons(queryClient),
  ]);
  return {
    ...buildSearchCatalog(heroes, items, ranks),
    seasons: seasons.map((season) => ({ startUnix: season.startDate.unix(), endUnix: season.endDate?.unix() })),
  };
}

/**
 * What a question came to: the page to open, a question no page answers, or a visitor who asked too much. A failed
 * model call throws, like any other failed request.
 */
type Routed = { kind: "opened"; id: string; href: string } | { kind: "not_understood" } | { kind: "rate_limited" };

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
    const entities = questionEntities(question, vocabulary);
    const decided = await decideSearch({ data: { question, entities, rankNames: [...vocabulary.rankNames] } });
    if (!decided.ok && decided.reason === "rate_limited") return done({ kind: "rate_limited" });
    if (!decided.ok) throw new Error("The search model is unavailable");
    intent = intentFromDecision(decided.answers, question, entities, vocabulary.rankNames);
  }
  const target = resolveIntent(intent, catalog, { patches: PATCH_ENTRIES, seasons, now: Date.now() / 1000 });
  if (!target) return done({ kind: "not_understood" });
  return done({ kind: "opened", id: target.page.id, href: target.path + stringifySearch(target.search) });
}
