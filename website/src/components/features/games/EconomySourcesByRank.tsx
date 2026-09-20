import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiGameStatsRequest, Rank } from "deadlock_api_client";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { SizedRankTierTick } from "~/components/domain/rank/RankTierTick";
import { ChartLegend, ChartLegendItem, ChartSwatch } from "~/components/patterns/charts/ChartLegend";
import { ChartEmpty, ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import { CHART_AXIS, CHART_CURSOR_BAND, CHART_GRID } from "~/components/patterns/charts/theme";
import { PanelTooltipCard, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/panel-tooltip";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { gameStatsQueryOptions } from "~/queries/games-query";
import { ranksQueryOptions } from "~/queries/ranks-query";

import { formatPercent, formatSouls, formatSoulsCompact, groupSouls, SOUL_SOURCE_GROUPS } from "./economy-definitions";

interface EconomySourcesByRankProps {
  params: AnalyticsApiGameStatsRequest;
}

type Mode = "share" | "souls";

interface TierRow {
  tier: number;
  name: string;
  image: string | undefined;
  total: number;
  souls: Record<string, number>;
  share: Record<string, number>;
}

export default function EconomySourcesByRank({ params }: EconomySourcesByRankProps) {
  const [mode, setMode] = useState<Mode>("share");
  const { data, isPending, isError, isFetching, refetch } = useQuery(
    gameStatsQueryOptions({ ...params, bucket: "avg_badge" }),
  );
  const { data: ranksData } = useQuery(ranksQueryOptions);

  const tierData = useMemo(() => {
    const map = new Map<number, Rank>();
    ranksData?.forEach((r) => map.set(r.tier, r));
    return map;
  }, [ranksData]);

  const chartData = useMemo<TierRow[]>(() => {
    if (!data) return [];

    const tiers = new Map<number, { weight: number; souls: Record<string, number> }>();
    for (const entry of data) {
      if (entry.bucket <= 0) continue;
      const tier = Math.floor(entry.bucket / 10);
      const weight = entry.total_matches || 0;
      if (weight <= 0) continue;
      const acc = tiers.get(tier) ?? { weight: 0, souls: {} };
      acc.weight += weight;
      for (const group of SOUL_SOURCE_GROUPS) {
        acc.souls[group.key] = (acc.souls[group.key] ?? 0) + groupSouls(entry, group) * weight;
      }
      tiers.set(tier, acc);
    }

    return Array.from(tiers.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([tier, acc]) => {
        const souls: Record<string, number> = {};
        let total = 0;
        for (const group of SOUL_SOURCE_GROUPS) {
          const avg = acc.weight > 0 ? (acc.souls[group.key] ?? 0) / acc.weight : 0;
          souls[group.key] = avg;
          total += avg;
        }
        const share: Record<string, number> = {};
        for (const group of SOUL_SOURCE_GROUPS) {
          share[group.key] = total > 0 ? (souls[group.key] / total) * 100 : 0;
        }
        const rank = tierData.get(tier);
        return {
          tier,
          name: rank?.name ?? `Tier ${tier}`,
          image: rank?.images?.large_webp ?? rank?.images?.large ?? undefined,
          total,
          souls,
          share,
        };
      });
  }, [data, tierData]);

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        size="sm"
        width="hug"
        aria-label="Soul source unit"
        className="self-end"
        value={mode}
        onValueChange={setMode}
      >
        <SegmentedItem value="share">Share</SegmentedItem>
        <SegmentedItem value="souls">Souls</SegmentedItem>
      </Segmented>

      <div aria-live="polite" aria-busy={isPending}>
        {isPending ? (
          <ChartLoading label="soul sources by rank" />
        ) : isError ? (
          <ChartError label="soul sources by rank" retrying={isFetching} onRetry={() => void refetch()} />
        ) : chartData.length === 0 ? (
          <ChartEmpty label="soul sources by rank" />
        ) : (
          <ChartSurface label="Soul sources by rank chart" variant="bare">
            <BarChart data={chartData} margin={{ top: 16, right: 16, bottom: 24, left: 8 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis
                {...CHART_AXIS}
                dataKey="tier"
                interval={0}
                height={44}
                tick={<SizedRankTierTick tiers={chartData} />}
              />
              <YAxis
                {...CHART_AXIS}
                allowDecimals={mode !== "share"}
                domain={mode === "share" ? [0, 100] : [0, "auto"]}
                ticks={mode === "share" ? [0, 25, 50, 75, 100] : undefined}
                tickFormatter={(v: number) => (mode === "share" ? `${Math.round(v)}%` : formatSoulsCompact(v))}
              />
              <Tooltip
                cursor={CHART_CURSOR_BAND}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as TierRow;
                  return (
                    <PanelTooltipCard>
                      <TooltipHeader
                        lead={row.image && <img src={row.image} alt="" className="size-5" />}
                        title={row.name}
                        subtitle={`Total ${formatSouls(row.total)}`}
                      />
                      <TooltipStats>
                        {[...SOUL_SOURCE_GROUPS]
                          .sort((a, b) => row.souls[b.key] - row.souls[a.key])
                          .map((group) => (
                            <TooltipStat
                              key={group.key}
                              label={
                                <span className="flex items-center gap-1.5">
                                  <ChartSwatch color={group.color} />
                                  {group.label}
                                </span>
                              }
                              value={
                                <span className="inline-flex items-baseline gap-1.5">
                                  {formatSouls(row.souls[group.key])}
                                  <span className="font-normal text-muted-foreground">
                                    {formatPercent(row.share[group.key] / 100)}
                                  </span>
                                </span>
                              }
                            />
                          ))}
                      </TooltipStats>
                    </PanelTooltipCard>
                  );
                }}
              />
              {SOUL_SOURCE_GROUPS.map((group) => (
                <Bar
                  key={group.key}
                  dataKey={(row: TierRow) => (mode === "share" ? row.share[group.key] : row.souls[group.key])}
                  name={group.label}
                  stackId="souls"
                  fill={group.color}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ChartSurface>
        )}
      </div>

      <ChartLegend className="justify-center">
        {SOUL_SOURCE_GROUPS.map((group) => (
          <ChartLegendItem key={group.key} color={group.color}>
            {group.label}
          </ChartLegendItem>
        ))}
      </ChartLegend>
    </div>
  );
}
