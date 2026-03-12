import { useQueries } from "@tanstack/react-query";
import { parseAsInteger, useQueryState } from "nuqs";
import { lazy, Suspense } from "react";
import { ChunkErrorBoundary } from "~/components/ChunkErrorBoundary";

import { Filter } from "~/components/Filter";
import { LoadingLogo } from "~/components/LoadingLogo";
import { combineQueryStates } from "~/components/QueryRenderer";
import type { Dayjs } from "~/dayjs";
import { day } from "~/dayjs";
import { createPageMeta } from "~/lib/meta";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import { badgeDistributionQueryOptions } from "~/queries/badge-distribution-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";

const BadgeDistributionChart = lazy(() => import("./BadgeDistributionChart"));

export function meta() {
  return createPageMeta({
    title: "Rank Distribution | Deadlock API",
    description: "See the distribution of player ranks and badges across the Deadlock competitive ladder.",
    path: "/badge-distribution",
  });
}

const defaultDateRange: [Dayjs | undefined, Dayjs | undefined] = [
  day().subtract(30, "day").startOf("day"),
  day().endOf("day"),
];

export default function BadgeDistribution() {
  const [[startDate, endDate], setDateRange] = useQueryState(
    "date_range",
    parseAsDayjsRange.withDefault(defaultDateRange),
  );
  const [minDurationS, setMinDurationS] = useQueryState("min_duration_s", parseAsInteger);
  const [maxDurationS, setMaxDurationS] = useQueryState("max_duration_s", parseAsInteger);

  const filter = {
    minUnixTimestamp: startDate ? startDate.unix() : 0,
    maxUnixTimestamp: endDate ? endDate.unix() : undefined,
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
        <h1 className="text-3xl font-bold tracking-tight">Match Rank Distribution</h1>
        <p className="mt-1 text-sm text-muted-foreground">Player rank distribution across all badges</p>
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
              <BadgeDistributionChart badgeDistributionData={badgeDistributionQuery.data} ranksData={ranks.data ?? []} />
            </Suspense>
          </ChunkErrorBoundary>
        ) : null}
      </div>
    </div>
  );
}
