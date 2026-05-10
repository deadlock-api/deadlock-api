import { HydrationBoundary, useQueries } from "@tanstack/react-query";
import { LeaderboardRegionEnum } from "deadlock_api_client";
import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { useCallback, useRef } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { Filter } from "~/components/Filter";
import { LoadingLogo } from "~/components/LoadingLogo";
import { combineQueryStates } from "~/components/QueryRenderer";
import { createPageMeta } from "~/lib/meta";
import { ANALYTICS_CACHE_HEADERS, prefetchAndDehydrate } from "~/lib/query-ssr";
import { getDefaultRegion } from "~/lib/region";
import { leaderboardQueryOptions } from "~/queries/leaderboard-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";
import { LeaderboardSummary } from "~/routes/leaderboard/LeaderboardSummary";
import { LeaderboardTable, type LeaderboardTableHandle } from "~/routes/leaderboard/LeaderboardTable";

const REGION_VALUES = Object.values(LeaderboardRegionEnum) as [LeaderboardRegionEnum, ...LeaderboardRegionEnum[]];

function isRegion(value: string | null): value is LeaderboardRegionEnum {
  return value !== null && (REGION_VALUES as readonly string[]).includes(value);
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const regionParam = url.searchParams.get("region");
  const region: LeaderboardRegionEnum = isRegion(regionParam)
    ? regionParam
    : getDefaultRegion(request.headers.get("accept-language"));
  const heroIdParam = url.searchParams.get("hero_id");
  const heroId = heroIdParam ? Number.parseInt(heroIdParam, 10) || null : null;

  const dehydratedState = await prefetchAndDehydrate([
    (qc) => qc.prefetchQuery(ranksQueryOptions),
    (qc) => qc.prefetchQuery(leaderboardQueryOptions(region, heroId)),
  ]);
  return { dehydratedState, initialRegion: region };
}

export function headers() {
  return ANALYTICS_CACHE_HEADERS;
}

export function meta() {
  return createPageMeta({
    title: "Deadlock Leaderboard: Top Ranked Players by Region",
    description:
      "Browse the Deadlock ranked leaderboard across all regions. Filter by hero, rank badge, and search for any player.",
    path: "/leaderboard",
  });
}

export default function Leaderboard() {
  const { dehydratedState, initialRegion } = useLoaderData<typeof loader>();
  return (
    <HydrationBoundary state={dehydratedState}>
      <LeaderboardContent initialRegion={initialRegion} />
    </HydrationBoundary>
  );
}

function LeaderboardContent({ initialRegion }: { initialRegion: LeaderboardRegionEnum }) {
  const [region, setRegion] = useQueryState("region", parseAsStringLiteral(REGION_VALUES).withDefault(initialRegion));
  const [heroId, setHeroId] = useQueryState("hero_id", parseAsInteger);

  const [ranks, leaderboardQuery] = useQueries({
    queries: [ranksQueryOptions, leaderboardQueryOptions(region, heroId)],
  });

  const { isPending, isError, error } = combineQueryStates(ranks, leaderboardQuery);

  const tableRef = useRef<LeaderboardTableHandle>(null);

  const handleHeroClick = useCallback(
    (id: number) => {
      setHeroId(id);
    },
    [setHeroId],
  );

  const handleBadgeClick = useCallback((rank: number) => {
    tableRef.current?.jumpToRank(rank);
  }, []);

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Leaderboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Ranked player standings across all regions</p>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Browse the top-ranked Deadlock players by region. Filter by hero to see who dominates with specific
            characters, search for any player, and jump to any rank to see where you stand on the competitive ladder.
            Rankings are based on matchmaking rating earned through ranked play.
          </p>
        </div>
        <Filter.Root>
          <Filter.Hero value={heroId} onChange={setHeroId} allowNull />
          <Filter.Region value={region} onChange={(r) => setRegion(r as LeaderboardRegionEnum)} />
        </Filter.Root>
        <div className="min-h-200">
          {isPending ? (
            <div className="flex items-center justify-center py-24">
              <LoadingLogo />
            </div>
          ) : isError ? (
            <div className="py-8 text-center text-sm text-destructive">
              Failed to load leaderboard: {error?.message}
            </div>
          ) : leaderboardQuery.data ? (
            <>
              <LeaderboardSummary
                ranks={ranks.data ?? []}
                leaderboard={leaderboardQuery.data}
                onBadgeClick={handleBadgeClick}
              />
              <LeaderboardTable
                ref={tableRef}
                ranks={ranks.data ?? []}
                leaderboard={leaderboardQuery.data}
                onHeroClick={handleHeroClick}
              />
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
