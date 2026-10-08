import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiHeroStatsRequest, Rank } from "deadlock_api_client";
import { useMemo } from "react";

import {
  rankTierLook,
  type RankTierWinRate,
  RankTierWinRateChart,
} from "~/components/domain/rank/RankTierWinRateChart";
import { useDefaultPeriodLabel } from "~/hooks/useDefaultPeriodLabel";
import { getPickrateMultiplier } from "~/lib/constants";
import type { GameMode } from "~/lib/game-mode";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";
import { ranksQueryOptions } from "~/queries/ranks-query";

const MIN_TIER_MATCHES = 100;

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
  const statsQuery = useQuery(heroStatsQueryOptions({ ...request, bucket: "avg_badge" }));
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
      .map(([tier, agg]): RankTierWinRate =>
        Object.assign(rankTierLook(tier, rankByTier.get(tier)), {
          winRate: agg.wins / agg.matches,
          pickRate: (multiplier * agg.matches) / (all.get(tier) ?? agg.matches),
          matches: agg.matches,
        }),
      );
  }, [data, ranks, heroId, request.gameMode]);

  // Both are needed: without the rank list every tier is dropped.
  const failed = [statsQuery, ranksQuery].filter((query) => query.isError && !query.data);

  return (
    <RankTierWinRateChart
      className={className}
      description={`All ranks · ${period}`}
      tiers={tiers}
      subject={`${heroName} wins`}
      label={`${heroName} win rate by rank tier`}
      status={failed.length > 0 ? "error" : statsQuery.isPending || ranksQuery.isPending ? "pending" : "success"}
      retrying={failed.some((query) => query.isFetching)}
      onRetry={() => failed.forEach((query) => void query.refetch())}
    />
  );
}
