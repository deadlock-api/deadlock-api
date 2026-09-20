import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiHeroStatsRequest, Rank } from "deadlock_api_client";
import { useMemo } from "react";

import { SizedRankTierTick } from "~/components/domain/rank/RankTierTick";
import type { GameMode } from "~/components/domain/selectors/GameModeSelector";
import { WinRateBarChart } from "~/components/patterns/charts/WinRateBarChart";
import { Section } from "~/components/patterns/page/Section";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { PanelTooltipCard, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/panel-tooltip";
import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { getPickrateMultiplier } from "~/lib/constants";
import { formatPercent } from "~/lib/format";
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
    <PanelTooltipCard>
      <TooltipHeader lead={entry.image && <img src={entry.image} alt="" className="size-6" />} title={entry.name} />
      <TooltipStats>
        <TooltipStat label="Win rate" value={formatPercent(entry.winRate)} />
        <TooltipStat label="Pick rate" value={formatPercent(entry.pickRate)} />
        <TooltipStat label="Matches" value={entry.matches.toLocaleString("en-US")} />
      </TooltipStats>
    </PanelTooltipCard>
  );
}

export function HeroWinRateByRank({
  heroId,
  heroName,
  request,
}: {
  heroId: number;
  heroName: string;
  request: Omit<AnalyticsApiHeroStatsRequest, "gameMode"> & { gameMode?: GameMode };
}) {
  const byRankRequest = { ...request, bucket: "avg_badge" as const };
  const { data, isPending } = useQuery({
    queryKey: queryKeys.analytics.heroStatsByRank(byRankRequest),
    queryFn: async () => (await api.analytics_api.heroStats(byRankRequest)).data,
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
  const { data: ranks } = useQuery(ranksQueryOptions);

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

  if (isPending) {
    return <LoadingState label="win rate by rank" align="center" className="py-8" />;
  }
  if (tiers.length === 0) return null;

  const best = tiers.reduce((a, b) => (b.winRate > a.winRate ? b : a));
  const worst = tiers.reduce((a, b) => (b.winRate < a.winRate ? b : a));

  return (
    <Section
      title={`${heroName} Win Rate by Rank`}
      description={
        <>
          {heroName} wins most at <span className="font-semibold text-foreground">{best.name}</span> (
          {formatPercent(best.winRate)}) and least at{" "}
          <span className="font-semibold text-foreground">{worst.name}</span> ({formatPercent(worst.winRate)}). Each bar
          is one rank tier in the current patch; hover for pick rate and match count.
        </>
      }
    >
      <WinRateBarChart
        label={`${heroName} win rate by rank tier`}
        data={tiers}
        xKey="tier"
        valueKey="winRate"
        colorKey="color"
        xAxisHeight={48}
        xTick={<SizedRankTierTick tiers={tiers} />}
        tooltip={<TierTooltip />}
      />
    </Section>
  );
}
