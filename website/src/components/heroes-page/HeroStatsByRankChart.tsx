import { useQuery } from "@tanstack/react-query";
import type { AnalyticsHeroStats } from "deadlock_api_client";
import { useMemo } from "react";
import { CartesianGrid, Scatter, ScatterChart, type ScatterProps, Tooltip, XAxis, YAxis } from "recharts";

import { ChartSidebarLayout } from "~/components/analytics/ChartSidebarLayout";
import { ChartError, ChartLoading } from "~/components/analytics/ChartStates";
import { ChartSurface } from "~/components/analytics/ChartSurface";
import { ChartHeroSelector } from "~/components/selectors/ChartHeroSelector";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import type { MatchMode } from "~/components/selectors/MatchModeSelector";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "~/components/ui/empty";
import { CACHE_DURATIONS } from "~/constants/cache";
import type { Dayjs } from "~/dayjs";
import { useChartHeroVisibility, useHeroColorMap } from "~/hooks/useChartHeroVisibility";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { api } from "~/lib/api";
import { BANS_PER_MATCH } from "~/lib/ban-rate";
import { niceTicks } from "~/lib/chart-axis";
import { getPickrateMultiplier } from "~/lib/constants";
import { getRankImageUrl } from "~/lib/rank-utils";
import { queryKeys } from "~/queries/query-keys";
import { ranksQueryOptions } from "~/queries/ranks-query";
import { type HERO_STATS, hero_stats_transform } from "~/types/api_hero_stats";

import type { ByRankStat } from "./HeroStatSelectors";

interface HeroStatsByRankChartProps {
  minHeroMatches?: number;
  minHeroMatchesTotal?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  gameMode?: GameMode;
  matchMode?: MatchMode;
  xStat?: ByRankStat;
  yStat?: ByRankStat;
}

interface DataPoint {
  badge: number;
  xValue: number;
  yValue: number;
  rankName: string;
  subtier: number;
  matches: number;
  badgeImageUrl?: string;
  heroName: string;
  heroColor: string;
}

function formatStatValue(stat: ByRankStat, value: number): string {
  if (stat === "winrate" || stat === "pickrate" || stat === "ban_rate") return `${value.toFixed(2)}%`;
  if (stat === "net_worth_per_match") return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (stat === "wins" || stat === "losses" || stat === "matches")
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return value.toFixed(1);
}

function formatStatLabel(stat: ByRankStat): string {
  if (stat === "pickrate") return "Pick Rate (%)";
  if (stat === "winrate") return "Win Rate (%)";
  if (stat === "ban_rate") return "Ban Rate (%)";
  return stat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function tickFormatter(stat: ByRankStat): (v: number) => string {
  const format = (v: number) => Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (stat === "winrate" || stat === "pickrate" || stat === "ban_rate") return (v) => `${format(v)}%`;
  return format;
}

function BadgePoint(props: ScatterProps) {
  const { cx, cy, payload } = props as { cx: number; cy: number; payload: DataPoint };
  const imgUrl = payload.badgeImageUrl;
  if (!imgUrl) return <circle cx={cx} cy={cy} r={6} fill="#888" />;
  return <image x={cx - 18} y={cy - 18} width={36} height={36} href={imgUrl} />;
}

function CustomTooltip({
  active,
  payload,
  xStat,
  yStat,
}: {
  active?: boolean;
  payload?: { payload: DataPoint; name: string; color: string }[];
  xStat: ByRankStat;
  yStat: ByRankStat;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="min-w-[10rem] rounded-lg border border-border/50 bg-background px-3 py-2.5 text-xs shadow-xl">
      <div className="mb-2 flex items-center gap-2">
        <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: data.heroColor }} />
        <span className="text-sm font-semibold text-foreground">{data.heroName}</span>
      </div>
      <div className="mb-2 flex items-center gap-2 border-b border-border/50 pb-2">
        {data.badgeImageUrl && <img src={data.badgeImageUrl} alt={data.rankName} className="size-6 object-contain" />}
        <span className="font-medium text-foreground">{data.rankName}</span>
      </div>
      <div className="grid gap-1">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{formatStatLabel(xStat)}</span>
          <span className="font-mono font-medium text-foreground tabular-nums">
            {formatStatValue(xStat, data.xValue)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{formatStatLabel(yStat)}</span>
          <span className="font-mono font-medium text-foreground tabular-nums">
            {formatStatValue(yStat, data.yValue)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Matches</span>
          <span className="font-mono font-medium text-foreground tabular-nums">
            {data.matches.toLocaleString("en-US")}
          </span>
        </div>
      </div>
    </div>
  );
}

function computeStatValue(stat: ByRankStat, agg: AggregatedTier, gameMode?: GameMode): number {
  if (stat === "pickrate") {
    return (agg.matches / agg.matchesPerBucket) * 100 * getPickrateMultiplier(gameMode);
  }
  return hero_stats_transform(agg as unknown as AnalyticsHeroStats, stat as (typeof HERO_STATS)[number]);
}

function getStatValue(
  stat: ByRankStat,
  agg: AggregatedTier,
  gameMode: GameMode | undefined,
  banRateByTier: Map<number, Map<number, number>> | undefined,
  heroId: number,
  tier: number,
): number {
  if (stat === "ban_rate") {
    return banRateByTier?.get(tier)?.get(heroId) ?? 0;
  }
  return computeStatValue(stat, agg, gameMode);
}

interface AggregatedTier {
  wins: number;
  losses: number;
  matches: number;
  matchesPerBucket: number;
  players: number;
  total_kills: number;
  total_deaths: number;
  total_assists: number;
  total_net_worth: number;
  total_last_hits: number;
  total_denies: number;
}

function newAggregatedTier(): AggregatedTier {
  return {
    wins: 0,
    losses: 0,
    matches: 0,
    matchesPerBucket: 0,
    players: 0,
    total_kills: 0,
    total_deaths: 0,
    total_assists: 0,
    total_net_worth: 0,
    total_last_hits: 0,
    total_denies: 0,
  };
}

function addToAggregatedTier(agg: AggregatedTier, entry: AnalyticsHeroStats): void {
  agg.wins += entry.wins;
  agg.losses += entry.losses;
  agg.matches += entry.matches;
  agg.matchesPerBucket += entry.matches_per_bucket;
  agg.total_kills += entry.total_kills;
  agg.total_deaths += entry.total_deaths;
  agg.total_assists += entry.total_assists;
  agg.total_net_worth += entry.total_net_worth;
  agg.total_last_hits += entry.total_last_hits;
  agg.total_denies += entry.total_denies;
}

export function HeroStatsByRankChart({
  minHeroMatches,
  minHeroMatchesTotal,
  minDate,
  maxDate,
  gameMode,
  matchMode,
  xStat = "pickrate",
  yStat = "winrate",
}: HeroStatsByRankChartProps) {
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);

  const needsBanData = xStat === "ban_rate" || yStat === "ban_rate";

  const heroStatsByRankQuery = {
    minHeroMatches: minHeroMatches,
    minHeroMatchesTotal: minHeroMatchesTotal,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    bucket: "avg_badge" as const,
    gameMode: gameMode,
    matchMode,
  };
  const {
    data: heroData,
    isLoading: isLoadingHeroStats,
    isError: isErrorHeroStats,
    isFetching: isFetchingHeroStats,
    refetch: refetchHeroStats,
  } = useQuery({
    queryKey: queryKeys.analytics.heroStatsByRank(heroStatsByRankQuery),
    queryFn: async () => {
      const response = await api.analytics_api.heroStats(heroStatsByRankQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });

  const banStatsByRankQuery = {
    bucket: "avg_badge" as const,
    minAverageBadge: undefined,
    maxAverageBadge: undefined,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    matchMode,
  };
  const {
    data: banData,
    isLoading: isLoadingBanStats,
    isError: isErrorBanStats,
    isFetching: isFetchingBanStats,
    refetch: refetchBanStats,
  } = useQuery({
    queryKey: queryKeys.analytics.heroBanStats(banStatsByRankQuery),
    queryFn: async () => {
      const response = await api.analytics_api.heroBanStats(banStatsByRankQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
    enabled: needsBanData,
  });

  const banRateByTier = useMemo(() => {
    if (!banData) return undefined;
    // Aggregate subtier buckets into tiers before computing rates
    const tierTotals = new Map<number, number>();
    const tierHeroBans = new Map<number, Map<number, number>>();
    for (const row of banData) {
      const tier = Math.floor(row.bucket / 10);
      tierTotals.set(tier, (tierTotals.get(tier) ?? 0) + row.bans);
      if (!tierHeroBans.has(tier)) tierHeroBans.set(tier, new Map());
      const heroMap = tierHeroBans.get(tier)!;
      heroMap.set(row.hero_id, (heroMap.get(row.hero_id) ?? 0) + row.bans);
    }
    const result = new Map<number, Map<number, number>>();
    for (const [tier, heroMap] of tierHeroBans) {
      const totalMatches = (tierTotals.get(tier) ?? 0) / BANS_PER_MATCH;
      const rateMap = new Map<number, number>();
      for (const [heroId, bans] of heroMap) {
        rateMap.set(heroId, totalMatches > 0 ? (bans / totalMatches) * 100 : 0);
      }
      result.set(tier, rateMap);
    }
    return result;
  }, [banData]);

  const {
    data: ranksData,
    isLoading: isLoadingRanks,
    isError: isErrorRanks,
    isFetching: isFetchingRanks,
    refetch: refetchRanks,
  } = useQuery(ranksQueryOptions);

  const { heroIdMap, isLoadingHeroes, isErrorHeroes, refetchHeroes, isFetchingHeroes } = useHeroColorMap();

  // Aggregate subtiers into tiers per hero (only depends on raw data)
  const tierAggByHero = useMemo(() => {
    if (!heroData) return {};
    const tierAgg: Record<number, Record<number, AggregatedTier>> = {};
    for (const entry of heroData) {
      const tier = Math.floor(entry.bucket / 10);
      if (!tierAgg[entry.hero_id]) tierAgg[entry.hero_id] = {};
      if (!tierAgg[entry.hero_id][tier]) tierAgg[entry.hero_id][tier] = newAggregatedTier();
      addToAggregatedTier(tierAgg[entry.hero_id][tier], entry);
    }
    return tierAgg;
  }, [heroData]);

  // Convert aggregated tiers to data points (depends on display settings)
  const heroDataByHero = useMemo(() => {
    const grouped: Record<number, DataPoint[]> = {};
    for (const [heroIdStr, tiers] of Object.entries(tierAggByHero)) {
      const heroId = Number(heroIdStr);
      grouped[heroId] = [];
      for (const [tierStr, agg] of Object.entries(tiers)) {
        const tier = Number(tierStr);
        const badge = tier * 10 + 6;
        const rank = ranksData?.find((candidate) => candidate.tier === tier);
        const hero = heroIdMap[heroId];
        grouped[heroId].push({
          badge,
          xValue: getStatValue(xStat, agg, gameMode, banRateByTier, heroId, tier),
          yValue: getStatValue(yStat, agg, gameMode, banRateByTier, heroId, tier),
          rankName: rank?.name ?? `Rank ${tier}`,
          subtier: 6,
          matches: agg.matches,
          badgeImageUrl: getRankImageUrl(rank) ?? undefined,
          heroName: hero?.name ?? `Hero ${heroId}`,
          heroColor: hero?.color ?? "#ffffff",
        });
      }
      grouped[heroId].sort((a, b) => a.badge - b.badge);
    }
    return grouped;
  }, [tierAggByHero, ranksData, gameMode, heroIdMap, xStat, yStat, banRateByTier]);

  const heroIdsWithData = useMemo(
    () =>
      Object.keys(heroDataByHero)
        .map(Number)
        .filter((id) => heroDataByHero[id]?.length),
    [heroDataByHero],
  );

  const { allHeroIds, effectiveVisibleSet, setVisibleHeroes } = useChartHeroVisibility(heroIdMap, {
    heroIdFilter: heroIdsWithData,
  });

  const selectedIds = allHeroIds.filter((id) => effectiveVisibleSet.has(id));
  const pickerHeroes = Object.entries(heroIdMap)
    .map(([id, hero]) => ({ id: Number(id), name: hero.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const [xTicks, yTicks] = useMemo(() => {
    const points = allHeroIds.filter((id) => effectiveVisibleSet.has(id)).flatMap((id) => heroDataByHero[id] ?? []);
    const xs = points.map((point) => point.xValue);
    const ys = points.map((point) => point.yValue);
    return points.length > 0
      ? [niceTicks(Math.min(...xs), Math.max(...xs), 6), niceTicks(Math.min(...ys), Math.max(...ys), 6)]
      : [
          [0, 1],
          [0, 1],
        ];
  }, [allHeroIds, effectiveVisibleSet, heroDataByHero]);

  const isLoading = isLoadingHeroStats || isLoadingRanks || isLoadingHeroes || isLoadingBanStats;

  return (
    <div aria-live="polite" aria-busy={isLoading}>
      {isLoading ? (
        <ChartLoading label="hero rank data" />
      ) : isErrorHeroStats || isErrorRanks || isErrorHeroes || (needsBanData && isErrorBanStats) ? (
        <ChartError
          label="hero rank data"
          retrying={isFetchingHeroStats || isFetchingRanks || isFetchingHeroes || (needsBanData && isFetchingBanStats)}
          onRetry={() => {
            if (isErrorHeroStats) void refetchHeroStats();
            if (isErrorRanks) void refetchRanks();
            if (isErrorHeroes) void refetchHeroes();
            if (needsBanData && isErrorBanStats) void refetchBanStats();
          }}
        />
      ) : (
        <ChartSidebarLayout
          sidebar={
            <ChartHeroSelector
              heroes={pickerHeroes}
              availableHeroIds={allHeroIds}
              selectedHeroIds={selectedIds}
              onSelectionChange={setVisibleHeroes}
            />
          }
        >
          <section className="overflow-hidden rounded-xl border bg-card" aria-label="Rank comparison chart">
            <h3 className="px-3 pt-3 text-sm font-semibold">Hero performance by rank</h3>
            {selectedIds.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>
                    {allHeroIds.length ? "Choose heroes to compare" : "No rank data for these filters"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {allHeroIds.length
                      ? "Select heroes in the picker or use Show all."
                      : "Try a wider date range or fewer filters."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ChartSurface
                label={`Hero ${formatStatLabel(xStat)} vs ${formatStatLabel(yStat)} by rank chart`}
                className="h-[360px] rounded-none border-0 sm:h-[420px]"
              >
                <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    type="number"
                    dataKey="xValue"
                    name={formatStatLabel(xStat)}
                    domain={[xTicks[0], xTicks[xTicks.length - 1]]}
                    ticks={xTicks}
                    label={{ value: formatStatLabel(xStat), position: "insideBottom", offset: -10 }}
                    stroke="var(--muted-foreground)"
                    tickFormatter={tickFormatter(xStat)}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="yValue"
                    name={formatStatLabel(yStat)}
                    label={{ value: formatStatLabel(yStat), angle: -90, position: "insideLeft", offset: -10 }}
                    stroke="var(--muted-foreground)"
                    domain={[yTicks[0], yTicks[yTicks.length - 1]]}
                    ticks={yTicks}
                    tickFormatter={tickFormatter(yStat)}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip isAnimationActive={false} content={<CustomTooltip xStat={xStat} yStat={yStat} />} />
                  {selectedIds.map((heroId) => (
                    <Scatter
                      key={heroId}
                      name={heroIdMap[heroId]?.name ?? `Hero ${heroId}`}
                      dataKey={heroId}
                      data={heroDataByHero[heroId]}
                      fill={heroIdMap[heroId]?.color ?? "#ffffff"}
                      line={{ stroke: heroIdMap[heroId]?.color ?? "#ffffff", strokeWidth: 2 }}
                      shape={<BadgePoint />}
                      isAnimationActive={false}
                    />
                  ))}
                </ScatterChart>
              </ChartSurface>
            )}
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              Each badge shows a rank tier. Lines connect ranks for the same hero.
            </p>
          </section>
        </ChartSidebarLayout>
      )}
    </div>
  );
}
