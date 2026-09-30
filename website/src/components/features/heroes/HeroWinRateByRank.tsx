import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiHeroStatsRequest, Rank } from "deadlock_api_client";
import { useMemo } from "react";

import { RankTierTick } from "~/components/domain/rank/RankTierTick";
import { ChartCard } from "~/components/patterns/charts/ChartCard";
import { ChartEmpty, ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { WinRateBarChart } from "~/components/patterns/charts/WinRateBarChart";
import { PanelBody } from "~/components/patterns/panel/Panel";
import { TooltipCard, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { CACHE_DURATIONS } from "~/constants/cache";
import { useDefaultPeriodLabel } from "~/hooks/useDefaultPeriodLabel";
import { api } from "~/lib/api";
import { getPickrateMultiplier } from "~/lib/constants";
import { formatPercent } from "~/lib/format";
import type { GameMode } from "~/lib/game-mode";
import { queryKeys } from "~/queries/query-keys";
import { ranksQueryOptions } from "~/queries/ranks-query";

const MIN_TIER_MATCHES = 100;

interface TierEntry {
  tier: number;
  name: string;
  color: string;
  image?: string;
  winRate: number;
  pickRate: number;
  matches: number;
}

function TierTooltip({ entry }: { entry?: TierEntry }) {
  if (!entry) return null;
  return (
    <TooltipCard>
      <TooltipHeader leading={entry.image && <img src={entry.image} alt="" className="size-6" />} title={entry.name} />
      <TooltipStats>
        <TooltipStat label="Win rate" value={formatPercent(entry.winRate)} />
        <TooltipStat label="Pick rate" value={formatPercent(entry.pickRate)} />
        <TooltipStat label="Matches" value={entry.matches.toLocaleString("en-US")} />
      </TooltipStats>
    </TooltipCard>
  );
}

export function HeroWinRateByRank({
  heroId,
  heroName,
  request,
  className,
}: {
  className?: string;
  heroId: number;
  heroName: string;
  request: Omit<AnalyticsApiHeroStatsRequest, "gameMode"> & { gameMode?: GameMode };
}) {
  const period = useDefaultPeriodLabel();
  const byRankRequest = { ...request, bucket: "avg_badge" as const };
  const statsQuery = useQuery({
    queryKey: queryKeys.analytics.heroStatsByRank(byRankRequest),
    queryFn: async () => (await api.analytics_api.heroStats(byRankRequest)).data,
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
  const ranksQuery = useQuery(ranksQueryOptions);
  const data = statsQuery.data;
  const ranks = ranksQuery.data;

  const tiers = useMemo(() => {
    if (!data || !ranks) return [];
    const rankByTier = new Map<number, Rank>(ranks.map((r) => [r.tier, r]));
    const hero = new Map<number, { wins: number; matches: number }>();
    const all = new Map<number, number>();
    for (const row of data) {
      if (row.bucket <= 0) continue;
      const tier = Math.floor(row.bucket / 10);
      all.set(tier, (all.get(tier) ?? 0) + row.matches);
      if (row.hero_id !== heroId) continue;
      const agg = hero.get(tier) ?? { wins: 0, matches: 0 };
      agg.wins += row.wins;
      agg.matches += row.matches;
      hero.set(tier, agg);
    }
    const multiplier = getPickrateMultiplier(request.gameMode);
    return [...hero.entries()]
      .filter(([, agg]) => agg.matches >= MIN_TIER_MATCHES)
      .sort(([a], [b]) => a - b)
      .map(([tier, agg]): TierEntry => {
        const rank = rankByTier.get(tier);
        return {
          tier,
          name: rank?.name ?? `Tier ${tier}`,
          color: rank?.color ?? "var(--color-primary)",
          image: rank?.images.large_webp ?? rank?.images.large ?? undefined,
          winRate: agg.wins / agg.matches,
          pickRate: (multiplier * agg.matches) / (all.get(tier) ?? agg.matches),
          matches: agg.matches,
        };
      });
  }, [data, ranks, heroId, request.gameMode]);

  // Both are needed: without the rank list every tier is dropped.
  const failed = [statsQuery, ranksQuery].filter((query) => query.isError && !query.data);
  const best = tiers.length > 0 ? tiers.reduce((a, b) => (b.winRate > a.winRate ? b : a)) : undefined;
  const worst = tiers.length > 0 ? tiers.reduce((a, b) => (b.winRate < a.winRate ? b : a)) : undefined;
  const chartLabel = `${heroName} win rate by rank tier`;

  return (
    <ChartCard
      className={className}
      title="Win Rate by Rank"
      description={`All ranks · ${period}`}
      footer={
        best &&
        worst && (
          <>
            {heroName} wins most at {best.name} ({formatPercent(best.winRate)}) and least at {worst.name} (
            {formatPercent(worst.winRate)}). Hover a bar for pick rate and matches.
          </>
        )
      }
    >
      <PanelBody size="sm">
        {failed.length > 0 ? (
          <ChartError
            label="win rate by rank"
            retrying={failed.some((query) => query.isFetching)}
            onRetry={() => failed.forEach((query) => void query.refetch())}
          />
        ) : statsQuery.isPending || ranksQuery.isPending ? (
          <ChartLoading label={chartLabel} />
        ) : tiers.length === 0 ? (
          <ChartEmpty label="rank tiers with enough matches" />
        ) : (
          <WinRateBarChart
            variant="flush"
            label={chartLabel}
            data={tiers}
            xKey="tier"
            valueKey="winRate"
            colorKey="color"
            xAxisHeight={48}
            xTick={<RankTierTick tiers={tiers} />}
            tooltip={<TierTooltip />}
          />
        )}
      </PanelBody>
    </ChartCard>
  );
}
