import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";

import { PanelSection } from "~/components/patterns/panel/Panel";
import { StaleOverlay } from "~/components/patterns/states/StaleOverlay";
import { Delta } from "~/components/ui/delta";
import { KeyValue, KeyValueList } from "~/components/ui/key-value";
import { Skeleton } from "~/components/ui/skeleton";
import type { BuildRow } from "~/lib/build-stats";
import { formatPercent } from "~/lib/format";
import { winRateNoise } from "~/lib/wilson";
import { type BuildPurchaseFilters, buildBucketsQueryOptions } from "~/queries/hero-build-stats-query";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";

/** Match lengths, as ranges of the 10-minute duration buckets' starts in seconds: under 20 minutes, 20-30, 30-40, over 40. */
const LENGTHS = [
  { label: "Under 20 min", from: 0, to: 1200 },
  { label: "20 to 30 min", from: 1200, to: 1800 },
  { label: "30 to 40 min", from: 1800, to: 2400 },
  { label: "Over 40 min", from: 2400, to: Infinity },
] as const;

/** A length needs this many of the build's matches for its win rate to be shown. */
const MIN_MATCHES = 20;

/**
 * How the build wins in short and long matches, against every player of the hero in matches of the same length: an
 * early-game build falls off as matches get longer.
 */
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
  // One request: the build's matches in 10-minute steps of match length, folded into the four ranges below.
  const query = useQuery({
    ...buildBucketsQueryOptions(
      {
        heroId,
        heroBuildId: build.hero_build_id,
        matchMode: filters.matchMode,
        minAverageBadge: filters.minAverageBadge,
        maxAverageBadge: filters.maxAverageBadge,
        minUnixTimestamp: filters.minUnixTimestamp,
        maxUnixTimestamp: filters.maxUnixTimestamp,
        minMatches: 1,
      },
      "duration",
    ),
    enabled: active,
    placeholderData: keepPreviousData,
  });
  // The hero's win rate per length: one request each (hero stats have no duration buckets), the same for every build,
  // so they stay cached while the selection moves.
  const heroLengths = useQueries({
    queries: LENGTHS.map((length) => ({
      ...heroStatsQueryOptions({
        gameMode: "normal",
        matchMode: filters.matchMode,
        minAverageBadge: filters.minAverageBadge,
        maxAverageBadge: filters.maxAverageBadge,
        minUnixTimestamp: filters.minUnixTimestamp,
        maxUnixTimestamp: filters.maxUnixTimestamp,
        minDurationS: length.from > 0 ? length.from : undefined,
        maxDurationS: Number.isFinite(length.to) ? length.to - 1 : undefined,
      }),
      select: (rows: { hero_id: number; wins: number; matches: number }[]) =>
        rows.find((row) => row.hero_id === heroId),
      enabled: active,
    })),
  });
  if (query.isError) return null;
  const lengths = LENGTHS.map((length) =>
    (query.data ?? [])
      .filter((row) => row.bucket >= length.from && row.bucket < length.to)
      .reduce((acc, row) => ({ wins: acc.wins + row.wins, matches: acc.matches + row.matches }), {
        wins: 0,
        matches: 0,
      }),
  );

  return (
    <section className="flex flex-col">
      <PanelSection variant="label" title="By match length" />
      <StaleOverlay active={query.isPlaceholderData} label="win rate by match length">
        <KeyValueList className="px-3 py-0.5">
          {LENGTHS.map((length, index) => {
            const stats = lengths[index];
            const hero = heroLengths[index].data;
            const enough = stats && stats.matches >= MIN_MATCHES;
            return (
              <KeyValue
                key={length.label}
                label={length.label}
                value={
                  query.isPending ? (
                    <Skeleton className="ms-auto h-4 w-24" />
                  ) : enough ? (
                    <span className="inline-flex items-baseline gap-2">
                      <span className="font-normal text-muted-foreground">{stats.matches.toLocaleString("en-US")}</span>
                      {formatPercent(stats.wins / stats.matches)}
                      <span className="w-14 text-end text-xs">
                        {hero && hero.matches > 0 && (
                          <Delta
                            value={stats.wins / stats.matches - hero.wins / hero.matches}
                            threshold={winRateNoise(stats.matches)}
                          />
                        )}
                      </span>
                    </span>
                  ) : null
                }
              />
            );
          })}
        </KeyValueList>
      </StaleOverlay>
    </section>
  );
}
