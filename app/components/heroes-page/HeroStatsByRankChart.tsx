import { useQuery } from "@tanstack/react-query";
import type { AnalyticsHeroStats } from "deadlock_api_client";
import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  type ScatterProps,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { LoadingLogo } from "~/components/LoadingLogo";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { CACHE_DURATIONS } from "~/constants/cache";
import type { Dayjs } from "~/dayjs";
import { useChartHeroVisibility, useHeroColorMap } from "~/hooks/useChartHeroVisibility";
import { api } from "~/lib/api";
import { assetsApi } from "~/lib/assets-api";
import { getPickrateMultiplier } from "~/lib/constants";
import { extractBadgeMap } from "~/lib/leaderboard";
import { queryKeys } from "~/queries/query-keys";
import { type HERO_STATS, hero_stats_transform } from "~/types/api_hero_stats";

import type { ByRankStat } from "./HeroStatSelectors";

interface HeroStatsByRankChartProps {
  minHeroMatches?: number;
  minHeroMatchesTotal?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  gameMode?: GameMode;
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
  if (stat === "winrate" || stat === "pickrate") return `${value.toFixed(2)}%`;
  if (stat === "net_worth_per_match") return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (stat === "wins" || stat === "losses" || stat === "matches" || stat === "players")
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return value.toFixed(1);
}

function formatStatLabel(stat: ByRankStat): string {
  if (stat === "pickrate") return "Pick Rate (%)";
  if (stat === "winrate") return "Win Rate (%)";
  return stat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function tickFormatter(stat: ByRankStat): (v: number) => string {
  if (stat === "winrate" || stat === "pickrate") return (v) => `${Number(v).toFixed(0)}%`;
  if (stat === "net_worth_per_match") return (v) => Number(v).toLocaleString();
  if (stat === "wins" || stat === "losses" || stat === "matches" || stat === "players")
    return (v) => Number(v).toLocaleString();
  return (v) => Number(v).toFixed(1);
}

function BadgePoint(props: ScatterProps & { badgeMap: Map<number, { small_webp?: string; small?: string }> }) {
  const { cx, cy, payload, badgeMap } = props as {
    cx: number;
    cy: number;
    payload: DataPoint;
    badgeMap: Map<number, { small_webp?: string; small?: string }>;
  };
  const badgeInfo = badgeMap.get(payload.badge);
  const imgUrl = badgeInfo?.small_webp || badgeInfo?.small;
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
          <span className="font-mono font-medium text-foreground tabular-nums">{data.matches.toLocaleString()}</span>
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
  agg.players += entry.players;
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
  xStat = "pickrate",
  yStat = "winrate",
}: HeroStatsByRankChartProps) {
  const minDateTimestamp = useMemo(() => minDate?.unix() ?? 0, [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const { data: heroData, isLoading: isLoadingHeroStats } = useQuery({
    queryKey: queryKeys.analytics.heroStatsByRank({
      minDateTimestamp,
      maxDateTimestamp,
      minHeroMatches,
      minHeroMatchesTotal,
      gameMode,
    }),
    queryFn: async () => {
      const response = await api.analytics_api.heroStats({
        minHeroMatches: minHeroMatches,
        minHeroMatchesTotal: minHeroMatchesTotal,
        minUnixTimestamp: minDateTimestamp,
        maxUnixTimestamp: maxDateTimestamp,
        bucket: "avg_badge",
        gameMode: gameMode,
      });
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });

  const { data: ranksData, isLoading: isLoadingRanks } = useQuery({
    queryKey: queryKeys.leaderboard.ranks(),
    queryFn: async () => {
      const response = await assetsApi.default_api.getRanksV2RanksGet();
      return response.data;
    },
    staleTime: CACHE_DURATIONS.FOREVER,
  });

  const { heroIdMap, isLoadingHeroes } = useHeroColorMap();

  const badgeMap = useMemo(() => (ranksData ? extractBadgeMap(ranksData) : new Map()), [ranksData]);

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
        const badgeInfo = badgeMap.get(badge);
        const hero = heroIdMap[heroId];
        grouped[heroId].push({
          badge,
          xValue: computeStatValue(xStat, agg, gameMode),
          yValue: computeStatValue(yStat, agg, gameMode),
          rankName: badgeInfo?.name ?? `Rank ${tier}`,
          subtier: 6,
          matches: agg.matches,
          badgeImageUrl: badgeInfo?.small_webp || badgeInfo?.small,
          heroName: hero?.name ?? `Hero ${heroId}`,
          heroColor: hero?.color ?? "#ffffff",
        });
      }
      grouped[heroId].sort((a, b) => a.badge - b.badge);
    }
    return grouped;
  }, [tierAggByHero, badgeMap, gameMode, heroIdMap, xStat, yStat]);

  const heroIdsWithData = useMemo(
    () =>
      Object.keys(heroDataByHero)
        .map(Number)
        .filter((id) => heroDataByHero[id]?.length),
    [heroDataByHero],
  );

  const { visibleHeroIds, handleLegendClick, legendPayload } = useChartHeroVisibility(
    heroIdMap,
    heroIdsWithData,
    "circle",
  );

  if (isLoadingHeroStats || isLoadingRanks || isLoadingHeroes) {
    return (
      <div className="flex h-full w-full items-center justify-center py-16">
        <LoadingLogo />
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={700} className="bg-muted p-4">
      <ScatterChart margin={{ top: 20, right: 30, bottom: 60, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
        <XAxis
          type="number"
          dataKey="xValue"
          name={formatStatLabel(xStat)}
          domain={["auto", "auto"]}
          label={{ value: formatStatLabel(xStat), position: "insideBottom", offset: -10 }}
          stroke="#525252"
          tickFormatter={tickFormatter(xStat)}
        />
        <YAxis
          type="number"
          dataKey="yValue"
          name={formatStatLabel(yStat)}
          label={{ value: formatStatLabel(yStat), angle: -90, position: "insideLeft", offset: -10 }}
          stroke="#525252"
          domain={["auto", "auto"]}
          tickFormatter={tickFormatter(yStat)}
        />
        <Tooltip content={<CustomTooltip xStat={xStat} yStat={yStat} />} />
        <Legend
          layout="horizontal"
          align="center"
          verticalAlign="bottom"
          onClick={handleLegendClick}
          payload={legendPayload}
          wrapperStyle={{ cursor: "pointer", paddingTop: 30 }}
        />
        {visibleHeroIds.map((heroId) => (
          <Scatter
            key={heroId}
            name={heroIdMap[heroId]?.name ?? `Hero ${heroId}`}
            data={heroDataByHero[heroId]}
            fill={heroIdMap[heroId]?.color ?? "#ffffff"}
            line={{ stroke: heroIdMap[heroId]?.color ?? "#ffffff", strokeWidth: 2 }}
            shape={<BadgePoint badgeMap={badgeMap} />}
          />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
