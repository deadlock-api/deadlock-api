import { useQueries } from "@tanstack/react-query";
import { LeaderboardRegionEnum } from "deadlock_api_client";
import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { useCallback, useRef } from "react";

import { Filter } from "~/components/Filter";
import { LoadingLogo } from "~/components/LoadingLogo";
import { combineQueryStates } from "~/components/QueryRenderer";
import { createPageMeta } from "~/lib/meta";
import { getDefaultRegion } from "~/lib/region";
import { leaderboardQueryOptions } from "~/queries/leaderboard-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";
import { LeaderboardSummary } from "~/routes/leaderboard/LeaderboardSummary";
import { LeaderboardTable, type LeaderboardTableHandle } from "~/routes/leaderboard/LeaderboardTable";

export function meta() {
  return createPageMeta({
    title: "Ranked Leaderboard | Deadlock API",
    description: "Browse the ranked Deadlock leaderboard with region filters, hero filters, and player search.",
    path: "/leaderboard",
  });
}

const REGION_VALUES = Object.values(LeaderboardRegionEnum) as [LeaderboardRegionEnum, ...LeaderboardRegionEnum[]];

export default function Leaderboard() {
  const [region, setRegion] = useQueryState(
    "region",
    parseAsStringLiteral(REGION_VALUES).withDefault(getDefaultRegion()),
  );
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
