import { useQueries } from "@tanstack/react-query";

import { PanelSection } from "~/components/patterns/panel/Panel";
import { Delta } from "~/components/ui/delta";
import { KeyValue, KeyValueList } from "~/components/ui/key-value";
import { Skeleton } from "~/components/ui/skeleton";
import type { BuildRow } from "~/lib/build-stats";
import { formatPercent } from "~/lib/format";
import { type BuildPurchaseFilters, heroBuildStatsQueryOptions } from "~/queries/hero-build-stats-query";

/** Match lengths in seconds, as the build stats filter them: under 20 minutes, 20-30, 30-40, over 40. */
const LENGTHS = [
  { label: "Under 20 min", min: undefined, max: 1199 },
  { label: "20 to 30 min", min: 1200, max: 1799 },
  { label: "30 to 40 min", min: 1800, max: 2399 },
  { label: "Over 40 min", min: 2400, max: undefined },
] as const;

/** A length needs this many of the build's matches for its win rate to be shown. */
const MIN_MATCHES = 20;

/** How the build wins in short and long matches: an early-game build falls off as matches get longer. */
export function BuildByDuration({
  heroId,
  build,
  filters,
  active = true,
}: {
  heroId: number;
  build: BuildRow;
  filters: BuildPurchaseFilters;
  /** False while the selection is still moving: nothing is asked for yet. */
  active?: boolean;
}) {
  const results = useQueries({
    queries: LENGTHS.map((length) => ({
      ...heroBuildStatsQueryOptions({
        heroId,
        heroBuildId: build.hero_build_id,
        matchMode: filters.matchMode,
        minAverageBadge: filters.minAverageBadge,
        maxAverageBadge: filters.maxAverageBadge,
        minUnixTimestamp: filters.minUnixTimestamp,
        maxUnixTimestamp: filters.maxUnixTimestamp,
        minDurationS: length.min,
        maxDurationS: length.max,
        minMatches: 1,
      }),
      enabled: active,
    })),
  });
  if (results.some((result) => result.isError)) return null;

  return (
    <section className="flex flex-col">
      <PanelSection title="By match length" />
      <KeyValueList className="px-3 py-0.5">
        {LENGTHS.map((length, index) => {
          const result = results[index];
          const stats = result.data?.[0];
          const enough = stats && stats.matches >= MIN_MATCHES;
          return (
            <KeyValue
              key={length.label}
              label={length.label}
              value={
                result.isPending ? (
                  <Skeleton className="ms-auto h-4 w-24" />
                ) : enough ? (
                  <span className="inline-flex items-baseline gap-2">
                    <span className="font-normal text-muted-foreground">{stats.matches.toLocaleString("en-US")}</span>
                    {formatPercent(stats.wins / stats.matches)}
                    <span className="w-14 text-end text-xs">
                      <Delta value={stats.wins / stats.matches - build.winRate} />
                    </span>
                  </span>
                ) : null
              }
            />
          );
        })}
      </KeyValueList>
    </section>
  );
}
