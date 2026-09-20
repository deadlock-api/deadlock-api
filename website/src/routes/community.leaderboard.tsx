import { useQueries } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { LeaderboardRegionEnum } from "deadlock_api_client";
import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { useCallback } from "react";

import { Filter } from "~/components/domain/filters";
import { LeaderboardTable } from "~/components/features/leaderboard/LeaderboardTable";
import { FilterToggleCell } from "~/components/patterns/filter-bar/FilterCell";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { combineQueryStates } from "~/components/patterns/states/QueryRenderer";
import { SegmentedItem } from "~/components/ui/segmented";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { getDefaultRegion, REGION_LABELS } from "~/lib/region";
import { fetchDefaultRegion } from "~/lib/region-fns";
import { seo } from "~/lib/seo";
import { leaderboardQueryOptions } from "~/queries/leaderboard-queries";

export const Route = createFileRoute("/community/leaderboard")({
  component: LeaderboardPage,
  // The hero filter lives in the URL under nuqs; read it here so the loader warms the board the page will show.
  loaderDeps: ({ search }) => {
    const heroId = (search as { hero_id?: unknown }).hero_id;
    return { heroId: typeof heroId === "number" && Number.isInteger(heroId) ? heroId : null };
  },
  loader: async ({ context: { queryClient }, deps }) => {
    // Resolve the default on the server so the client hydrates with the same region.
    const defaultRegion = typeof window === "undefined" ? await fetchDefaultRegion() : getDefaultRegion();
    await prefetchSafe(queryClient.ensureQueryData(leaderboardQueryOptions(defaultRegion, deps.heroId)));
    return { defaultRegion };
  },
  head: () =>
    seo({
      title: "Deadlock Leaderboard: Top Ranked Players by Region",
      description:
        "Browse the Deadlock ranked leaderboard across all regions. Filter by hero, rank badge, and search for any player.",
      path: "/community/leaderboard",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: "Deadlock Leaderboard: Top Ranked Players by Region",
        description:
          "Ranked player standings for Deadlock across all regions, sortable by matchmaking rating and filterable by hero.",
        url: "https://deadlock-api.com/community/leaderboard",
        keywords: ["Deadlock", "leaderboard", "leaderboards", "top players", "ranked ladder"],
        creator: { "@type": "Organization", name: "Deadlock API", url: "https://deadlock-api.com" },
        isAccessibleForFree: true,
        license: "https://github.com/deadlock-api/deadlock-api/blob/master/LICENSE",
      },
    }),
});

function LeaderboardPage() {
  // Keep the generated API client's runtime enum in this route's component chunk.
  const regions = Object.values(LeaderboardRegionEnum) as [LeaderboardRegionEnum, ...LeaderboardRegionEnum[]];
  const { defaultRegion } = Route.useLoaderData();
  const [region, setRegion] = useQueryState("region", parseAsStringLiteral(regions).withDefault(defaultRegion));
  const [heroId, setHeroId] = useQueryState("hero_id", parseAsInteger);

  const [leaderboardQuery] = useQueries({
    queries: [leaderboardQueryOptions(region, heroId)],
  });

  const { isPending, isError, error } = combineQueryStates(leaderboardQuery);

  const handleHeroClick = useCallback(
    (id: number) => {
      setHeroId(id);
    },
    [setHeroId],
  );

  return (
    <PageShell>
      <PageHeader title="Deadlock Leaderboard" description="Ranked player standings across all regions">
        <p>
          Browse the top-ranked Deadlock players by region. Filter by hero to see who dominates with specific
          characters, search for any player, and jump to any rank to see where you stand on the competitive ladder.
          Rankings are based on matchmaking rating earned through ranked play.
        </p>
      </PageHeader>
      <Filter.Root>
        <Filter.Hero value={heroId} onValueChange={setHeroId} allowNull />
        <FilterToggleCell label="Region" value={region} defaultValue={defaultRegion} onValueChange={setRegion}>
          {regions.map((regionOption) => (
            <SegmentedItem key={regionOption} value={regionOption}>
              {REGION_LABELS[regionOption]}
            </SegmentedItem>
          ))}
        </FilterToggleCell>
      </Filter.Root>
      <div className="min-h-200">
        {isPending ? (
          <LoadingState label="leaderboard" className="flex items-center justify-center py-24" />
        ) : isError ? (
          <ErrorState
            title="Failed to load leaderboard"
            description={error?.message}
            retrying={leaderboardQuery.isFetching}
            onRetry={() => void leaderboardQuery.refetch()}
          />
        ) : leaderboardQuery.data ? (
          <LeaderboardTable leaderboard={leaderboardQuery.data} onHeroClick={handleHeroClick} />
        ) : null}
      </div>
    </PageShell>
  );
}
