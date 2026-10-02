import { useQueries } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { BadgeDistribution, Rank } from "deadlock_api_client";
import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { Suspense, useMemo } from "react";

import { Filter } from "~/components/domain/filters";
import type { MatchTimeRange } from "~/components/domain/selectors/MatchTimeRangeSelector";
import BadgeDistributionChart, {
  BADGE_DISTRIBUTION_METRIC_LABEL,
  BADGE_DISTRIBUTION_METRICS,
} from "~/components/features/badge-distribution/BadgeDistributionChart";
import { FilterToggleCell } from "~/components/patterns/filter-bar/FilterCell";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { ChunkErrorBoundary } from "~/components/patterns/states/ChunkErrorBoundary";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { combineQueryStates } from "~/components/patterns/states/QueryRenderer";
import { SegmentedItem } from "~/components/ui/segmented";
import { useDateRangeState } from "~/hooks/useDateRangeState";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { defaultTemporalCoverage, defaultUnixRange } from "~/lib/seasons";
import { datasetJsonLd, pageTitle, seo } from "~/lib/seo";
import { loadSeasons } from "~/queries/asset-queries";
import { badgeDistributionQueryOptions } from "~/queries/badge-distribution-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";

/** The badge at which half of all players sit at or below, named like "Sentinel 4". */
function findMedianRankName(
  distribution: readonly BadgeDistribution[] | undefined,
  ranks: readonly Rank[] | undefined,
): string | null {
  if (!distribution || !ranks) return null;
  const rows = [...distribution].sort((a, b) => a.badge_level - b.badge_level);
  const total = rows.reduce((sum, row) => sum + (row.unique_players ?? 0), 0);
  if (total === 0) return null;
  let running = 0;
  for (const row of rows) {
    running += row.unique_players ?? 0;
    if (running >= total / 2) {
      const rank = ranks.find((r) => r.tier === Math.floor(row.badge_level / 10));
      return rank?.name ? `${rank.name} ${row.badge_level % 10}` : null;
    }
  }
  return null;
}

export const Route = createFileRoute("/community/badge-distribution")({
  component: BadgeDistributionPage,
  loader: async ({ context: { queryClient, preferences } }) => {
    const seasons = await loadSeasons(queryClient);
    const range = defaultUnixRange(seasons, preferences.dateFilter);
    const [distribution, ranks] = await Promise.all([
      prefetchSafe(
        queryClient.query({
          ...badgeDistributionQueryOptions({
            ...range,
          }),
          staleTime: "static",
        }),
      ),
      prefetchSafe(queryClient.query({ ...ranksQueryOptions, staleTime: "static" })),
    ]);
    return {
      medianRank: findMedianRankName(distribution, ranks),
      coverage: defaultTemporalCoverage(seasons, preferences.dateFilter),
    };
  },
  head: ({ loaderData }) => {
    const year = new Date().getFullYear();
    const median = loaderData?.medianRank ? ` Half of all players sit at ${loaderData.medianRank} or below.` : "";
    return seo({
      title: pageTitle(`Deadlock Rank Distribution ${year}: % of Players per Rank`),
      description: `What percent of Deadlock players sit at each rank and subtier, from Obscurus to Eternus.${median}`,
      path: "/community/badge-distribution",
      jsonLd: datasetJsonLd({
        name: `Deadlock Rank Distribution ${year}`,
        description:
          "Distribution of Deadlock players across every rank badge and subtier, showing the share of players at each tier of the competitive ladder along with rank percentiles.",
        path: "/community/badge-distribution",
        keywords: ["Deadlock", "rank distribution", "badge distribution", "rank percentiles", "MMR"],
        variableMeasured: ["share of players per rank", "rank percentile"],
        temporalCoverage: loaderData?.coverage,
        apiPath: "/v1/analytics/badge-distribution",
      }),
    });
  },
});

function BadgeDistributionPage() {
  const { startDate, endDate, handleDateChange, defaultRange } = useDateRangeState();
  const [minDurationS, setMinDurationS] = useQueryState("min_duration_s", parseAsInteger);
  const [maxDurationS, setMaxDurationS] = useQueryState("max_duration_s", parseAsInteger);
  const [metric, setMetric] = useQueryState(
    "metric",
    parseAsStringLiteral(BADGE_DISTRIBUTION_METRICS).withDefault("players"),
  );

  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(startDate, endDate);

  const filter = {
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    minDurationS: minDurationS ?? undefined,
    maxDurationS: maxDurationS ?? undefined,
  };

  const handleDurationChange = ([min, max]: MatchTimeRange) => {
    void setMinDurationS(min ?? null);
    void setMaxDurationS(max ?? null);
  };

  const [ranks, badgeDistributionQuery] = useQueries({
    queries: [ranksQueryOptions, badgeDistributionQueryOptions(filter)],
  });

  const { isPending, isError, error } = combineQueryStates(badgeDistributionQuery, ranks);

  const rankNames = useMemo(
    () =>
      [...(ranks.data ?? [])]
        .sort((a, b) => a.tier - b.tier)
        .map((rank) => rank.name)
        .filter((name): name is string => !!name),
    [ranks.data],
  );

  return (
    <PageShell height="viewport">
      <PageHeader
        title="Deadlock Rank Distribution"
        // Follows the metric: "players" counts players per badge of their matches' average rank, not matches.
        description={
          metric === "players"
            ? "Players by the average rank of their matches, badge by badge"
            : "Matches by their average rank, badge by badge"
        }
      >
        {rankNames.length > 1 && (
          <p>
            Deadlock ranks climb from {rankNames.slice(0, -1).join(", ")} to {rankNames.at(-1)}, with every rank except{" "}
            {rankNames[0]} split into 6 subrank badges.
          </p>
        )}
      </PageHeader>
      <Filter.Root>
        <Filter.MatchDuration
          value={[minDurationS ?? undefined, maxDurationS ?? undefined]}
          onValueChange={handleDurationChange}
        />
        <Filter.SeasonPatchDate
          value={{ startDate, endDate }}
          onValueChange={({ startDate: start, endDate: end, action }) => handleDateChange(start, end, action)}
          defaultValue={{ startDate: defaultRange[0], endDate: defaultRange[1] }}
        />
        <FilterToggleCell label="Metric" value={metric} defaultValue="players" onValueChange={setMetric}>
          {BADGE_DISTRIBUTION_METRICS.map((value) => (
            <SegmentedItem key={value} value={value}>
              {BADGE_DISTRIBUTION_METRIC_LABEL[value]}
            </SegmentedItem>
          ))}
        </FilterToggleCell>
      </Filter.Root>
      <div className="flex min-h-72 flex-1 items-center justify-center">
        {isPending ? (
          <LoadingState label="rank distribution" />
        ) : isError ? (
          <ErrorState
            title="Failed to load rank distribution"
            description={error?.message}
            retrying={badgeDistributionQuery.isFetching || ranks.isFetching}
            onRetry={() => {
              if (badgeDistributionQuery.isError) void badgeDistributionQuery.refetch();
              if (ranks.isError) void ranks.refetch();
            }}
          />
        ) : badgeDistributionQuery.data?.length === 0 ? (
          // An empty answer drew a bare grid with only an axis label.
          <EmptyState
            title="No ranked matches for these filters"
            description="Try a wider date range or a shorter minimum match duration."
          />
        ) : badgeDistributionQuery.data ? (
          <ChunkErrorBoundary>
            <Suspense fallback={<LoadingState label="rank distribution chart" />}>
              <BadgeDistributionChart
                badgeDistributionData={badgeDistributionQuery.data}
                ranksData={ranks.data ?? []}
                metric={metric}
              />
            </Suspense>
          </ChunkErrorBoundary>
        ) : null}
      </div>
    </PageShell>
  );
}
