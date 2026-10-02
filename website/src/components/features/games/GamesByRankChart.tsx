import { useQuery } from "@tanstack/react-query";
import type { Rank } from "deadlock_api_client";
import type { AnalyticsApiGameStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { RANK_ICON_AXIS_HEIGHT, RankTierIcons } from "~/components/domain/rank/RankTierIcons";
import { ChartLoading, ChartError, ChartEmpty } from "~/components/patterns/charts/ChartStates";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import { CHART_GRID, CHART_X_AXIS, CHART_Y_AXIS, CHART_Y_LABEL } from "~/components/patterns/charts/theme";
import { Stat, StatGroup } from "~/components/ui/stat";
import { TooltipCard, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { BUFF_TIMINGS_NOTE } from "~/lib/buffs";
import { extractBadgeMap } from "~/lib/leaderboard";
import { gameStatsQueryOptions } from "~/queries/games-query";
import { ranksQueryOptions } from "~/queries/ranks-query";

import { formatAxisTick, formatStatValue, getStatDefinition, valueSpan } from "./stat-definitions";
import { StatSelector } from "./StatSelector";

interface GamesByRankChartProps {
  params: AnalyticsApiGameStatsRequest;
  stat: string;
  onStatChange: (stat: string) => void;
  isStreetBrawl?: boolean;
}

interface ChartEntry {
  badge: number;
  tier: number;
  label: string;
  /** `null` on the gaps between tiers, so they neither draw a bar nor pull the y axis down to zero. */
  value: number | null;
  /** The bar's colour; Recharts reads it from the data point. */
  fill: string;
  isSpacer?: boolean;
}

export default function GamesByRankChart({ params, stat, onStatChange, isStreetBrawl = false }: GamesByRankChartProps) {
  const { data, isPending, isError, isFetching, refetch } = useQuery(
    gameStatsQueryOptions({ ...params, bucket: "avg_badge" }),
  );

  const { data: ranksData } = useQuery(ranksQueryOptions);

  const tierData = useMemo(() => {
    const map = new Map<number, Rank>();
    ranksData?.forEach((r) => map.set(r.tier, r));
    return map;
  }, [ranksData]);

  const badgeMap = useMemo(() => extractBadgeMap(ranksData ?? []), [ranksData]);

  const statDef = getStatDefinition(stat);

  const chartData = useMemo(() => {
    if (!data) return [];
    const sorted = data.filter((entry) => entry.bucket > 0).sort((a, b) => a.bucket - b.bucket);

    if (sorted.length === 0) return [];

    const result: ChartEntry[] = [];
    let lastTier = -1;

    for (const entry of sorted) {
      const tier = Math.floor(entry.bucket / 10);
      const subtier = entry.bucket % 10;
      const rank = tierData.get(tier);

      if (lastTier !== -1 && tier !== lastTier) {
        result.push({
          badge: lastTier * 10 + 7,
          tier: lastTier,
          label: "",
          value: null,
          fill: "transparent",
          isSpacer: true,
        });
      }

      result.push({
        badge: entry.bucket,
        tier,
        label: rank ? `${rank.name} ${subtier}` : `${entry.bucket}`,
        value: entry[stat as keyof typeof entry] ?? null,
        fill: rank?.color ?? "var(--color-accent)",
      });

      lastTier = tier;
    }

    return result;
  }, [data, stat, tierData]);
  const span = valueSpan(chartData);

  /**
   * The stat over all matches and per rank tier, as text under the plot: totals add up over the tier's badges, averages
   * are weighted by their matches. Every tier keeps its tile while new data loads, so the layout holds still.
   */
  const tierReadings = useMemo(() => {
    const isTotal = stat.startsWith("total_");
    const tiers = new Map<number, { weight: number; sum: number }>();
    const all = { weight: 0, sum: 0 };
    for (const entry of data ?? []) {
      const value = entry[stat as keyof typeof entry];
      const weight = isTotal ? 1 : entry.total_matches;
      if (typeof value !== "number" || weight <= 0) continue;
      all.weight += weight;
      all.sum += value * weight;
      // Badge 0 is the matches without an average rank: counted in all matches, not in a tier.
      if (entry.bucket <= 0) continue;
      const tier = Math.floor(entry.bucket / 10);
      const acc = tiers.get(tier) ?? { weight: 0, sum: 0 };
      acc.weight += weight;
      acc.sum += value * weight;
      tiers.set(tier, acc);
    }
    const valueOf = (acc: { weight: number; sum: number } | undefined) =>
      acc && acc.weight > 0 ? (isTotal ? acc.sum : acc.sum / acc.weight) : null;
    const byTier = (ranksData ?? [])
      .filter((rank) => rank.tier > 0)
      .sort((a, b) => a.tier - b.tier)
      .map((rank) => ({ tier: rank.tier, name: rank.name, value: valueOf(tiers.get(rank.tier)) }));
    // All matches first, the number the overview shows: with the eleven tiers it fills the rows evenly.
    return byTier.length > 0 ? [{ tier: -1, name: "All Matches", value: valueOf(all) }, ...byTier] : [];
  }, [data, ranksData, stat]);

  const tierCenters = useMemo(() => {
    if (chartData.length === 0) return [];
    const tiers = new Map<number, { firstBadge: number; lastBadge: number }>();
    for (const entry of chartData) {
      if (entry.isSpacer) continue;
      const existing = tiers.get(entry.tier);
      if (!existing) {
        tiers.set(entry.tier, { firstBadge: entry.badge, lastBadge: entry.badge });
      } else {
        existing.lastBadge = entry.badge;
      }
    }
    return Array.from(tiers.entries()).map(([tier, { firstBadge, lastBadge }]) => ({
      tier,
      firstBadge,
      lastBadge,
    }));
  }, [chartData]);

  return (
    <div className="@container flex flex-col gap-4">
      <StatSelector value={stat} onChange={onStatChange} isStreetBrawl={isStreetBrawl} />

      <div aria-live="polite" aria-busy={isPending}>
        {isPending ? (
          <ChartLoading label="game rank data" />
        ) : isError ? (
          <ChartError label="game rank data" retrying={isFetching} onRetry={() => void refetch()} />
        ) : chartData.every((entry) => entry.value == null) ? (
          <ChartEmpty label="game rank data" description={statDef?.recordedSince ? BUFF_TIMINGS_NOTE : undefined} />
        ) : (
          <ChartSurface label={`${statDef?.label ?? stat} by rank chart`}>
            <BarChart data={chartData} margin={{ top: 16, right: 20, bottom: 12, left: 0 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis {...CHART_X_AXIS} dataKey="badge" tick={false} height={RANK_ICON_AXIS_HEIGHT} />
              <YAxis
                // Bars grow from zero: from the smallest value, the lowest rank drew no bar and the rest were
                // lengths relative to it.
                domain={[0, "auto"]}
                tickFormatter={(v) => (statDef ? formatAxisTick(v, statDef.format, span) : String(v))}
                {...CHART_Y_AXIS}
                label={{ ...CHART_Y_LABEL, value: statDef?.label ?? stat }}
              />
              <Tooltip
                cursor={false}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const entry = payload[0].payload as ChartEntry;
                  if (entry.isSpacer) return null;
                  const info = badgeMap.get(entry.badge);
                  const imageUrl = info?.large_webp ?? info?.large;
                  return (
                    <TooltipCard>
                      <TooltipHeader
                        leading={imageUrl && <img src={imageUrl} alt="" className="size-5" />}
                        title={entry.label}
                      />
                      <TooltipStats>
                        <TooltipStat
                          label={statDef?.label ?? stat}
                          value={statDef ? formatStatValue(entry.value, statDef.format) : entry.value}
                        />
                      </TooltipStats>
                    </TooltipCard>
                  );
                }}
              />
              <Bar dataKey="value" radius={4} isAnimationActive={false} />
              <RankTierIcons tiers={tierCenters} ranks={tierData} />
            </BarChart>
          </ChartSurface>
        )}
      </div>

      {tierReadings.length > 0 && (
        <StatGroup variant="joined" size="sm" className="grid-cols-3 @xl:grid-cols-4 @4xl:grid-cols-6">
          {tierReadings.map((reading) => (
            <Stat
              key={reading.tier}
              label={reading.name}
              value={
                reading.value == null
                  ? undefined
                  : statDef
                    ? formatStatValue(reading.value, statDef.format)
                    : reading.value
              }
            />
          ))}
        </StatGroup>
      )}
    </div>
  );
}
