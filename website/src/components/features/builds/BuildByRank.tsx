import { useQuery } from "@tanstack/react-query";

import { RankTierTick } from "~/components/domain/rank/RankTierTick";
import { type RankTierWinRate, rankTierLook } from "~/components/domain/rank/RankTierWinRateChart";
import { ChartEmpty, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { WinRateBarChart } from "~/components/patterns/charts/WinRateBarChart";
import { PanelSection } from "~/components/patterns/panel/Panel";
import { TooltipCard, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { badgeTiers, type BuildRow } from "~/lib/build-stats";
import { formatPercent, formatSignedPercent } from "~/lib/format";
import { type BuildPurchaseFilters, buildBucketsQueryOptions } from "~/queries/hero-build-stats-query";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";
import { ranksQueryOptions } from "~/queries/ranks-query";

/** A rank needs this many of the build's matches for its win rate to be shown. */
const MIN_MATCHES = 20;

/** Room under the bars for the rank badges. */
const BADGE_AXIS_HEIGHT = 36;

type RankBar = RankTierWinRate & { heroWinRate?: number };

function RankBarTooltip({ entry }: { entry?: RankBar }) {
  if (!entry) return null;
  return (
    <TooltipCard>
      <TooltipHeader leading={entry.image && <img src={entry.image} alt="" className="size-6" />} title={entry.name} />
      <TooltipStats>
        <TooltipStat label="Win rate" value={formatPercent(entry.winRate)} />
        {entry.heroWinRate !== undefined && (
          <>
            <TooltipStat label="Hero at this rank" value={formatPercent(entry.heroWinRate)} />
            <TooltipStat label="Vs. hero" value={formatSignedPercent(entry.winRate - entry.heroWinRate)} />
          </>
        )}
        <TooltipStat label="Matches" value={entry.matches.toLocaleString("en-US")} />
      </TooltipStats>
    </TooltipCard>
  );
}

/**
 * How the build wins at each rank in the filtered range, a bar per rank from the 50% line; its card reads it against
 * every player of the hero at that rank. Some builds carry low ranks and fall off higher up.
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

  const ranks = new Map((ranksQuery.data ?? []).map((rank) => [rank.tier, rank]));
  const bars: RankBar[] = [...badgeTiers(query.data ?? [])]
    .filter(([, stats]) => stats.matches >= MIN_MATCHES)
    .sort(([a], [b]) => a - b)
    .map(([tier, stats]) => {
      const hero = heroQuery.data?.get(tier);
      return Object.assign(rankTierLook(tier, ranks.get(tier)), {
        winRate: stats.wins / stats.matches,
        matches: stats.matches,
        heroWinRate: hero && hero.matches > 0 ? hero.wins / hero.matches : undefined,
      });
    });

  return (
    // The last section of its panel: the plot takes the height the row leaves it, from a compact minimum.
    <section className="flex flex-1 flex-col">
      <PanelSection variant="label" title="By rank" />
      {query.isPending || ranksQuery.isPending ? (
        <ChartLoading label="Win rate by rank" size="grow" />
      ) : bars.length === 0 ? (
        <ChartEmpty label="ranks with enough matches of this build" />
      ) : (
        <WinRateBarChart
          variant="flush"
          size="grow"
          label={`The build's win rate by rank, from ${bars[0].name} (${formatPercent(bars[0].winRate)}) to ${bars[bars.length - 1].name} (${formatPercent(bars[bars.length - 1].winRate)})`}
          data={bars}
          xKey="tier"
          valueKey="winRate"
          xAxisHeight={BADGE_AXIS_HEIGHT}
          xTick={<RankTierTick tiers={bars} />}
          tooltip={<RankBarTooltip />}
        />
      )}
    </section>
  );
}
