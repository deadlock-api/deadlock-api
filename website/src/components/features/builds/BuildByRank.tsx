import { useQuery } from "@tanstack/react-query";

import { PanelSection } from "~/components/patterns/panel/Panel";
import { Delta } from "~/components/ui/delta";
import { KeyValue, KeyValueList } from "~/components/ui/key-value";
import { Skeleton } from "~/components/ui/skeleton";
import { badgeTiers, type BuildRow } from "~/lib/build-stats";
import { formatPercent } from "~/lib/format";
import { type BuildPurchaseFilters, buildBucketsQueryOptions } from "~/queries/hero-build-stats-query";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";
import { ranksQueryOptions } from "~/queries/ranks-query";

/** A rank needs this many of the build's matches for its win rate to be shown. */
const MIN_MATCHES = 20;

/**
 * How the build wins at each rank in the filtered range, against every player of the hero at that rank: some builds
 * carry low ranks and fall off higher up.
 */
export function BuildByRank({
  heroId,
  build,
  filters,
  active,
}: {
  heroId: number;
  build: BuildRow;
  filters: BuildPurchaseFilters;
  /** False while the selection is still moving: nothing is asked for yet. */
  active: boolean;
}) {
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
      "avg_badge",
    ),
    enabled: active,
  });
  const heroQuery = useQuery({
    ...heroStatsQueryOptions({
      gameMode: "normal",
      matchMode: filters.matchMode,
      minAverageBadge: filters.minAverageBadge,
      maxAverageBadge: filters.maxAverageBadge,
      minUnixTimestamp: filters.minUnixTimestamp,
      maxUnixTimestamp: filters.maxUnixTimestamp,
      bucket: "avg_badge",
    }),
    select: (rows) => badgeTiers(rows.filter((row) => row.hero_id === heroId)),
    enabled: active,
  });
  const ranksQuery = useQuery(ranksQueryOptions);
  if (query.isError || ranksQuery.isError) return null;

  // One row per rank in the filtered range, there before the numbers load so the section does not grow.
  const minTier = Math.floor((filters.minAverageBadge ?? 0) / 10);
  const maxTier = Math.floor((filters.maxAverageBadge ?? Infinity) / 10);
  const tiers = (ranksQuery.data ?? []).filter((rank) => rank.tier > 0 && rank.tier >= minTier && rank.tier <= maxTier);
  const buildTiers = badgeTiers(query.data ?? []);

  return (
    <section className="flex flex-col">
      <PanelSection title="By rank" />
      <KeyValueList className="px-3 py-0.5">
        {tiers.map((rank) => {
          const stats = buildTiers.get(rank.tier);
          const hero = heroQuery.data?.get(rank.tier);
          return (
            <KeyValue
              key={rank.tier}
              label={rank.name}
              value={
                query.isPending ? (
                  <Skeleton className="ms-auto h-4 w-24" />
                ) : stats && stats.matches >= MIN_MATCHES ? (
                  <span className="inline-flex items-baseline gap-2">
                    <span className="font-normal text-muted-foreground">{stats.matches.toLocaleString("en-US")}</span>
                    {formatPercent(stats.wins / stats.matches)}
                    <span className="w-14 text-end text-xs">
                      {hero && hero.matches > 0 && (
                        <Delta value={stats.wins / stats.matches - hero.wins / hero.matches} />
                      )}
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
