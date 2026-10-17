import { queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiHeroBuildStatsRequest, AnalyticsApiItemStatsRequest } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { type BuildPerformanceTotals, PERFORMANCE_TOTAL_KEYS } from "~/lib/build-performance";
import { buildAbilityOrder, type BuildItemPurchase, type BuildMeta, type BuildStatRow } from "~/lib/build-stats";
import { API_ORIGIN } from "~/lib/constants";
import { GraphqlHttpError } from "~/lib/graphql";

import { queryKeys } from "./query-keys";

export function heroBuildStatsQueryOptions(params: AnalyticsApiHeroBuildStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.heroBuildStats(params),
    queryFn: async (): Promise<BuildStatRow[]> => {
      const response = await api.analytics_api.heroBuildStats(params);
      return response.data.map(({ hero_build_id, wins, losses, matches, players }) => ({
        hero_build_id,
        wins,
        losses,
        matches,
        players,
      }));
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
  });
}

/**
 * The hero build stats with the performance totals of every build, by build id. A request of its own: the totals make
 * the query read about three times the data, so the page's list does not wait for them.
 */
export function heroBuildPerformanceQueryOptions(params: AnalyticsApiHeroBuildStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.heroBuildStats({ ...params, includePerformance: true }),
    queryFn: async (): Promise<Record<number, BuildPerformanceTotals>> => {
      const response = await api.analytics_api.heroBuildStats({ ...params, includePerformance: true });
      const rows = response.data;
      // An API without the totals leaves them out: those builds have no performance rather than zeros.
      return Object.fromEntries(
        rows.flatMap((row) => {
          if (row.total_kills === undefined || row.total_kills === null) return [];
          const totals = {
            matches: row.matches,
            avg_average_badge: row.avg_average_badge ?? 0,
          } as BuildPerformanceTotals;
          for (const key of PERFORMANCE_TOTAL_KEYS) totals[key] = row[key] ?? 0;
          return [[row.hero_build_id, totals]];
        }),
      );
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
  });
}

/** Builds asked for in one GraphQL request: 100 resolve in about half a second, well inside the complexity limit. */
export const BUILD_META_BATCH = 100;

/** The build ids in request batches, sorted, so the same builds are the same cache entries whatever their order. */
export function buildMetaBatches(buildIds: readonly number[]): number[][] {
  const sorted = [...new Set(buildIds)].sort((a, b) => a - b);
  const batches: number[][] = [];
  for (let i = 0; i < sorted.length; i += BUILD_META_BATCH) batches.push(sorted.slice(i, i + BUILD_META_BATCH));
  return batches;
}

interface GraphqlBuild {
  hero_build: {
    hero_build_id: number;
    name: string;
    author_account_id: number;
    version: number;
    last_updated_timestamp: number;
    language: number;
    details: {
      mod_categories:
        | {
            name: string | null;
            description: string | null;
            mods: { ability_id: number; annotation: string | null }[] | null;
          }[]
        | null;
      ability_order: { currency_changes: { ability_id: number; currency_type: number; delta: number }[] | null } | null;
    } | null;
  };
}

const BUILD_FIELDS =
  "hero_build{hero_build_id name author_account_id version last_updated_timestamp language " +
  "details{mod_categories{name description mods{ability_id annotation}} ability_order{currency_changes{ability_id currency_type delta}}}}";

/**
 * The latest version of each build in `buildIds`, by id; a build the API no longer stores maps to null. The builds
 * endpoint takes one id at a time, so one GraphQL request asks for all of them under aliases.
 */
export function heroBuildMetaQueryOptions(heroId: number, buildIds: readonly number[]) {
  return queryOptions({
    queryKey: queryKeys.analytics.heroBuildMeta(heroId, buildIds),
    queryFn: async ({ signal }): Promise<Record<number, BuildMeta | null>> => {
      const fields = buildIds.map(
        (id) =>
          `b${id}: hero_builds(where: {hero_id: ${heroId}, build_id: ${id}, only_latest: true}, limit: 1) {${BUILD_FIELDS}}`,
      );
      const response = await fetch(`${API_ORIGIN}/v1/graphql`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: `query HeroBuildMeta {${fields.join(" ")}}` }),
        signal,
      });
      if (!response.ok) throw new GraphqlHttpError(response.status, `${response.status}: ${await response.text()}`);
      const body = (await response.json()) as {
        data?: Record<string, GraphqlBuild[] | null>;
        errors?: { message: string }[];
      };
      if (!body.data) throw new Error(body.errors?.[0]?.message ?? "GraphQL returned no data");
      const result: Record<number, BuildMeta | null> = {};
      for (const id of buildIds) {
        const build = body.data[`b${id}`]?.[0]?.hero_build;
        result[id] = build
          ? {
              buildId: build.hero_build_id,
              name: build.name.trim() || `Build ${build.hero_build_id}`,
              authorId: build.author_account_id,
              version: build.version,
              updatedAt: build.last_updated_timestamp,
              language: build.language,
              categories: (build.details?.mod_categories ?? []).map((category) => ({
                name: category.name ?? "",
                description: category.description?.trim() || null,
                notes: Object.fromEntries(
                  (category.mods ?? []).flatMap((mod) => {
                    const note = mod.annotation?.trim();
                    return note ? [[mod.ability_id, note]] : [];
                  }),
                ),
                // An item listed twice in one category is shown once.
                itemIds: [...new Set((category.mods ?? []).map((mod) => mod.ability_id))],
              })),
              abilityOrder: buildAbilityOrder(build.details?.ability_order?.currency_changes),
            }
          : null;
      }
      return result;
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
  });
}

/**
 * The items bought by the players who started their matches with `buildId`, from the item stats. Every item with one
 * purchase counts: the panel compares them with the build's own list.
 */
export type BuildPurchaseFilters = Pick<
  AnalyticsApiItemStatsRequest,
  "gameMode" | "matchMode" | "minAverageBadge" | "maxAverageBadge" | "minUnixTimestamp" | "maxUnixTimestamp"
>;

export function buildItemPurchasesQueryOptions(buildId: number, params: BuildPurchaseFilters, heroId: number) {
  const request = { ...params, heroIds: String(heroId), heroBuildId: buildId, minMatches: 1 };
  return queryOptions({
    queryKey: queryKeys.analytics.itemStats(request),
    queryFn: async (): Promise<BuildItemPurchase[]> => {
      const response = await api.analytics_api.itemStats(request);
      return response.data.map(({ item_id, wins, matches, avg_buy_time_s, sold, avg_sell_time_s }) => ({
        item_id,
        wins,
        matches,
        avg_buy_time_s,
        sold: sold ?? 0,
        avg_sell_time_s,
      }));
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
  });
}
