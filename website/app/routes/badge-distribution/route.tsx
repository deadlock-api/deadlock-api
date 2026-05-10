import { HydrationBoundary, useQueries } from "@tanstack/react-query";
import { parseAsInteger, useQueryState } from "nuqs";
import { lazy, Suspense } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { ChunkErrorBoundary } from "~/components/ChunkErrorBoundary";
import { Filter } from "~/components/Filter";
import { LoadingLogo } from "~/components/LoadingLogo";
import { combineQueryStates } from "~/components/QueryRenderer";
import { day, type Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { createPageMeta } from "~/lib/meta";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import { ANALYTICS_CACHE_HEADERS, prefetchAndDehydrate } from "~/lib/query-ssr";
import { normalizeUnixCeil, normalizeUnixFloor, roundedNow } from "~/lib/time-normalize";
import { badgeDistributionQueryOptions } from "~/queries/badge-distribution-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";

const BadgeDistributionChart = lazy(() => import("./BadgeDistributionChart"));

function parseDayjsRange(value: string | null): [Dayjs | undefined, Dayjs | undefined] | null {
  if (!value) return null;
  const parts = value.split("_");
  if (parts.length !== 2) return null;
  const start = parts[0] ? day(parts[0]) : undefined;
  const end = parts[1] ? day(parts[1]) : undefined;
  return [start, end];
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const range = parseDayjsRange(url.searchParams.get("date_range")) ?? [
    roundedNow("day").subtract(30, "day"),
    roundedNow("day").endOf("day"),
  ];
  const minDurationS = url.searchParams.get("min_duration_s");
  const maxDurationS = url.searchParams.get("max_duration_s");
  const filter = {
    minUnixTimestamp: normalizeUnixFloor(range[0]) ?? 0,
    maxUnixTimestamp: normalizeUnixCeil(range[1]),
    minDurationS: minDurationS ? Number.parseInt(minDurationS, 10) || undefined : undefined,
    maxDurationS: maxDurationS ? Number.parseInt(maxDurationS, 10) || undefined : undefined,
  };

  const dehydratedState = await prefetchAndDehydrate([
    (qc) => qc.prefetchQuery(ranksQueryOptions),
    (qc) => qc.prefetchQuery(badgeDistributionQueryOptions(filter)),
  ]);
  return { dehydratedState };
}

export function headers() {
  return ANALYTICS_CACHE_HEADERS;
}

export function meta() {
  return createPageMeta({
    title: "Deadlock Rank Distribution: Badge Stats & Rank Percentiles",
    description:
      "See the Deadlock rank distribution across all badges and subtiers. Find out what percentage of players are at each rank on the competitive ladder.",
    path: "/badge-distribution",
  });
}

const defaultDateRange: [Dayjs | undefined, Dayjs | undefined] = [
  roundedNow("day").subtract(30, "day"),
  roundedNow("day").endOf("day"),
];

export default function BadgeDistribution() {
  const { dehydratedState } = useLoaderData<typeof loader>();
  return (
    <HydrationBoundary state={dehydratedState}>
      <BadgeDistributionContent />
    </HydrationBoundary>
  );
}

function BadgeDistributionContent() {
  const [[startDate, endDate], setDateRange] = useQueryState(
    "date_range",
    parseAsDayjsRange.withDefault(defaultDateRange),
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
        <h1 className="text-3xl font-bold tracking-tight">Match Rank Distribution</h1>
        <p className="mt-1 text-sm text-muted-foreground">Average match rank distribution across all badges</p>
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
