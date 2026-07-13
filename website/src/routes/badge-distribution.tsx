import { useQueries } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { parseAsInteger, useQueryState } from "nuqs";
import { Suspense } from "react";

import BadgeDistributionChart from "~/components/badge-distribution/BadgeDistributionChart";
import { ChunkErrorBoundary } from "~/components/ChunkErrorBoundary";
import { Filter } from "~/components/Filter";
import { LoadingLogo } from "~/components/LoadingLogo";
import { combineQueryStates } from "~/components/QueryRenderer";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { DEFAULT_DATE_RANGE } from "~/lib/constants";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { seo } from "~/lib/seo";
import { normalizeUnixCeil, normalizeUnixFloor } from "~/lib/time-normalize";
import { badgeDistributionQueryOptions } from "~/queries/badge-distribution-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";

export const Route = createFileRoute("/badge-distribution")({
  component: BadgeDistributionPage,
  loader: async ({ context: { queryClient } }) => {
    await prefetchSafe(
      queryClient.ensureQueryData(
        badgeDistributionQueryOptions({
          minUnixTimestamp: normalizeUnixFloor(DEFAULT_DATE_RANGE[0]) ?? 0,
          maxUnixTimestamp: normalizeUnixCeil(DEFAULT_DATE_RANGE[1]),
        }),
      ),
    );
  },
  head: () => {
    const year = new Date().getFullYear();
    return seo({
      title: `Deadlock Rank Distribution ${year}: Badge Stats & Percentiles`,
      description:
        "See the Deadlock rank distribution across all badges and subtiers. Find out what percentage of players are at each rank on the competitive ladder.",
      path: "/badge-distribution",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: `Deadlock Rank Distribution ${year}`,
        description:
          "Distribution of Deadlock players across every rank badge and subtier, showing the share of players at each tier of the competitive ladder along with rank percentiles.",
        url: "https://deadlock-api.com/badge-distribution",
        keywords: ["Deadlock", "rank distribution", "badge distribution", "rank percentiles", "MMR"],
        creator: { "@type": "Organization", name: "Deadlock API", url: "https://deadlock-api.com" },
        isAccessibleForFree: true,
      },
    });
  },
});

function BadgeDistributionPage() {
  const [[startDate, endDate], setDateRange] = useQueryState(
    "date_range",
    parseAsDayjsRange.withDefault(DEFAULT_DATE_RANGE),
  );
  const [minDurationS, setMinDurationS] = useQueryState("min_duration_s", parseAsInteger);
  const [maxDurationS, setMaxDurationS] = useQueryState("max_duration_s", parseAsInteger);

  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(startDate, endDate);

  const filter = {
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    minDurationS: minDurationS ?? undefined,
    maxDurationS: maxDurationS ?? undefined,
  };

  const handleDurationChange = (min: number | undefined, max: number | undefined) => {
    setMinDurationS(min ?? null);
    setMaxDurationS(max ?? null);
  };

  const handleDateChange = (newStartDate?: Dayjs, newEndDate?: Dayjs) => {
    setDateRange([newStartDate, newEndDate]);
  };

  const [ranks, badgeDistributionQuery] = useQueries({
    queries: [ranksQueryOptions, badgeDistributionQueryOptions(filter)],
  });

  const { isPending, isError, error } = combineQueryStates(badgeDistributionQuery, ranks);

  return (
    <div className="flex h-[calc(100dvh-2rem)] flex-col gap-4">
      <div className="shrink-0 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Deadlock Rank Distribution</h1>
        <p className="mt-1 text-sm text-muted-foreground">Average match rank distribution across all badges</p>
        <p className="mx-auto mt-2 max-w-3xl text-sm text-muted-foreground">
          Deadlock ranks climb from Obscurus, Initiate, Seeker, Alchemist, Arcanist, Ritualist, Emissary, Archon,
          Oracle, Phantom, Ascendant to Eternus, with every rank except Obscurus and Eternus split into 6 subrank
          badges.
        </p>
      </div>
      <Filter.Root>
        <Filter.MatchDuration
          minTime={minDurationS ?? undefined}
          maxTime={maxDurationS ?? undefined}
          onTimeChange={handleDurationChange}
        />
        <Filter.PatchOrDate startDate={startDate} endDate={endDate} onDateChange={handleDateChange} />
      </Filter.Root>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {isPending ? (
          <div className="flex items-center justify-center">
            <LoadingLogo />
          </div>
        ) : isError ? (
          <div className="text-center text-sm text-destructive">Failed to load rank distribution: {error?.message}</div>
        ) : badgeDistributionQuery.data ? (
          <ChunkErrorBoundary>
            <Suspense fallback={<LoadingLogo />}>
              <BadgeDistributionChart
                badgeDistributionData={badgeDistributionQuery.data}
                ranksData={ranks.data ?? []}
              />
            </Suspense>
          </ChunkErrorBoundary>
        ) : null}
      </div>
    </div>
  );
}
