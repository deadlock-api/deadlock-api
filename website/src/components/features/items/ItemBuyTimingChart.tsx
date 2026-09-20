import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiItemStatsRequest } from "deadlock_api_client";
import { Fragment, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { ChartCard } from "~/components/patterns/charts/ChartCard";
import { ChartLegend, ChartLegendItem, ChartSwatch } from "~/components/patterns/charts/ChartLegend";
import { ChartLoading } from "~/components/patterns/charts/ChartStates";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_AXIS,
  CHART_COLOR,
  CHART_CURSOR_LINE,
  CHART_GRID,
  CHART_MARGIN,
  CHART_TICK,
  SERIES_COLORS,
} from "~/components/patterns/charts/theme";
import { PanelBody } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { Field } from "~/components/ui/field";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Separator } from "~/components/ui/separator";
import { Inline } from "~/components/ui/stack";
import { SwitchField } from "~/components/ui/switch-field";
import {
  Tooltip as HoverTooltip,
  TooltipCard,
  TooltipHeader,
  TooltipStat,
  TooltipStats,
} from "~/components/ui/tooltip";
import { TooltipProvider } from "~/components/ui/tooltip";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";

const VIEW_OPTIONS = [
  { value: "net_worth_by_1000", label: "Net Worth" },
  { value: "game_time_min", label: "Time" },
  { value: "game_time_normalized_percentage", label: "Time (Relative)" },
] as const;

type BucketType = Exclude<AnalyticsApiItemStatsRequest["bucket"], undefined>;
type ChartData = never[] | Record<string, ChartPoint[]>;

const MIN_AVG_THRESHOLD = 0.1; // 5 %
const BUCKET_INCREMENTS = [1000, 2000, 3000, 5000, 7000, 10000] as const;

interface ChartPoint {
  displayBucket: number;
  bucketStart: number;
  bucketEnd: number;
  winrate: number | null;
  trueWinrate: number | null;
  matches: number;
}

function wilsonLowerBound(wins: number, total: number) {
  if (total === 0) return 0;
  const p = wins / total;
  const n = total;
  const z = 1.96;
  const numerator = p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  const denominator = 1 + (z * z) / n;
  return Math.max(0, numerator / denominator);
}

function computeAverageMatchCount(itemData: { bucket: number | null; matches: number }[], increment: number): number {
  const groups = new Map<number, { matches: number }>();
  for (const p of itemData) {
    const key = Math.floor((p.bucket as number) / increment) * increment;
    const g = groups.get(key) || { matches: 0 };
    g.matches += p.matches;
    groups.set(key, g);
  }
  const totalMatches = Array.from(groups.values()).reduce((sum, g) => sum + g.matches, 0);
  return totalMatches / groups.size;
}

const BUCKET_CONFIG = {
  game_time_min: {
    label: "Minutes",
    formatter: (v: number) => `${Math.round(v)}`,
    tooltipPrefix: "Minute",
    tickCount: 12,
  },
  net_worth_by_1000: {
    label: "Net Worth",
    formatter: (v: number) => `${Math.round(v / 1000)}K`,
    tooltipPrefix: "Net Worth",
    tickCount: 10,
  },
  game_time_normalized_percentage: {
    label: "Minutes (Relative)",
    formatter: (v: number) => `${Math.round(v)}%`,
    tooltipPrefix: "Minutes (Relative)",
    tickCount: 10,
  },
} as const satisfies Partial<Record<BucketType, unknown>>;

function buildChartData({
  data,
  itemIds,
  bucketType,
  useWilsonInterval,
  minAvgThreshold,
  rowTotalMatches,
}: {
  data?: Array<{ item_id: number; bucket: number | null; matches: number; wins: number }>;
  itemIds: number[];
  bucketType: keyof typeof BUCKET_CONFIG;
  useWilsonInterval: boolean;
  minAvgThreshold: number;
  rowTotalMatches?: number;
}): ChartData {
  const result: Record<string, ChartPoint[]> = {};

  for (const itemId of itemIds) {
    const itemData = data?.filter((d) => d.item_id === itemId) ?? [];
    if (itemData.length === 0) return [];

    const bucketIncrements =
      bucketType === "net_worth_by_1000" ? BUCKET_INCREMENTS : BUCKET_INCREMENTS.map((inc) => inc / 1000);

    let increment = rowTotalMatches ? bucketIncrements[bucketIncrements.length - 1] : bucketIncrements[0];
    if (rowTotalMatches) {
      for (const inc of bucketIncrements) {
        const avgMatches = computeAverageMatchCount(itemData, inc);
        const avgPercent = avgMatches / rowTotalMatches;
        if (avgPercent >= minAvgThreshold) {
          increment = inc;
          break;
        }
      }
    }

    const groups = new Map<number, { matches: number; wins: number }>();
    for (const point of itemData) {
      const key = Math.floor((point.bucket as number) / increment) * increment;
      const group = groups.get(key) || { matches: 0, wins: 0 };
      group.matches += point.matches;
      group.wins += point.wins;
      groups.set(key, group);
    }

    const keys = Array.from(groups.keys()).sort((a, b) => a - b);
    const points: ChartPoint[] = [];

    for (const key of keys) {
      const group = groups.get(key);
      if (!group) continue;

      const bucketStart = key;
      const bucketEnd = key + increment;
      const displayBucket = key + increment / 2;

      if (!group.matches) {
        points.push({
          displayBucket,
          bucketStart,
          bucketEnd,
          winrate: null,
          trueWinrate: null,
          matches: 0,
        });
        continue;
      }

      const trueWR = (group.wins / group.matches) * 100;
      const wilson = wilsonLowerBound(group.wins, group.matches) * 100;
      points.push({
        displayBucket,
        bucketStart,
        bucketEnd,
        winrate: useWilsonInterval ? wilson : trueWR,
        trueWinrate: trueWR,
        matches: group.matches,
      });
    }

    result[String(itemId)] = points;
  }

  return result;
}

interface ItemBuyTimingChartProps {
  itemIds: number[];
  baseQueryOptions: Omit<AnalyticsApiItemStatsRequest, "bucket">;
  rowTotalMatches?: number;
}

export function ItemBuyTimingChart({ itemIds, baseQueryOptions, rowTotalMatches }: ItemBuyTimingChartProps) {
  const [showFineGrainedIntervals, setShowFineGrainedIntervals] = useState(false);
  const [useWilsonInterval, setUseWilsonInterval] = useState(true);
  const [bucketType, setBucketType] = useState<keyof typeof BUCKET_CONFIG>("net_worth_by_1000");

  const baseMinAvgThreshold = rowTotalMatches && rowTotalMatches > 200 ? MIN_AVG_THRESHOLD : MIN_AVG_THRESHOLD * 1.5;
  const minAvgThreshold = showFineGrainedIntervals ? baseMinAvgThreshold / 2 : baseMinAvgThreshold;
  const minMatches = rowTotalMatches && rowTotalMatches > 500 ? 20 : rowTotalMatches && rowTotalMatches > 250 ? 10 : 2;

  const { data: itemsData } = useQuery(itemUpgradesQueryOptions);
  const itemNameMap = useMemo(() => {
    return itemsData?.reduce(
      (acc, item) => {
        acc[item.id] = item.name;
        return acc;
      },
      {} as Record<number, string>,
    );
  }, [itemsData]);

  const queryOptions = useMemo(
    () => ({ ...baseQueryOptions, bucket: bucketType, minMatches }),
    [baseQueryOptions, bucketType, minMatches],
  );

  const { data, isLoading } = useQuery(itemStatsQueryOptions(queryOptions));

  const chartData: ChartData = useMemo(
    () =>
      buildChartData({
        data,
        itemIds,
        bucketType,
        useWilsonInterval,
        minAvgThreshold,
        rowTotalMatches,
      }),
    [data, itemIds, bucketType, useWilsonInterval, minAvgThreshold, rowTotalMatches],
  );

  const config = BUCKET_CONFIG[bucketType];

  const dataRange = useMemo<[number, number]>(() => {
    const allPoints = Object.values(chartData).flat();
    const valid = allPoints.filter((d) => d.winrate !== null);
    if (!valid.length) return [0, 1];
    const min = Math.min(...valid.map((d) => d.displayBucket));
    const max = Math.max(...valid.map((d) => d.displayBucket));
    const adjustmentFactor = bucketType === "net_worth_by_1000" ? 1000 : 1;
    return [Math.max(0, min - adjustmentFactor), max + adjustmentFactor];
  }, [chartData, bucketType]);

  const hasValidData =
    !isLoading &&
    Object.values(chartData)
      .flat()
      .some((d) => d.winrate !== null && d.matches > 0);

  const purchaseAxis = bucketType === "game_time_min" ? "purchase time" : "net worth at purchase";
  const seriesColor = (index: number) => SERIES_COLORS[index] ?? CHART_COLOR.neutral;

  return (
    <TooltipProvider>
      <ChartCard title="Purchase Analysis" description={`Win rate by ${purchaseAxis}`} className="w-full">
        <PanelBody size="sm">
          <Inline className="gap-x-4 gap-y-2">
            <Field label="View by" orientation="horizontal">
              <Segmented value={bucketType} onValueChange={setBucketType} width="hug">
                {VIEW_OPTIONS.map((option) => (
                  <SegmentedItem key={option.value} value={option.value}>
                    {option.label}
                  </SegmentedItem>
                ))}
              </Segmented>
            </Field>
            <SwitchField
              size="sm"
              checked={useWilsonInterval}
              onCheckedChange={setUseWilsonInterval}
              className="items-center"
              label={
                <>
                  Use conservative win-rate estimate based on volume
                  <HoverTooltip
                    content={
                      <p>
                        Less matches played for a datapoint means we're less confident in the win rate, so we reduce it
                        a bit to compensate.
                      </p>
                    }
                  >
                    <span className="icon-[material-symbols--info] size-4 text-muted-foreground" />
                  </HoverTooltip>
                </>
              }
            />
            {rowTotalMatches && (
              <SwitchField
                size="sm"
                checked={showFineGrainedIntervals}
                onCheckedChange={setShowFineGrainedIntervals}
                className="items-center"
                label="Show fine grained intervals"
              />
            )}
          </Inline>
        </PanelBody>
        <Separator />
        <div aria-live="polite" aria-busy={isLoading}>
          {isLoading ? (
            <div className="p-2">
              <ChartLoading label="purchase analysis" size="lg" />
            </div>
          ) : itemIds.length === 0 ? (
            <EmptyState
              variant="plain"
              title="Pick one or more items above"
              description="to compare how their win rate changes with when they are bought."
            />
          ) : !hasValidData ? (
            <EmptyState variant="plain" title="No data available" />
          ) : (
            <>
              {itemIds.length > 1 && (
                <ChartLegend className="px-3 pt-2">
                  {itemIds.map((itemId, index) => (
                    <ChartLegendItem key={itemId} color={seriesColor(index)} shape="line">
                      {itemNameMap?.[itemId] ?? `Item ${itemId}`}
                    </ChartLegendItem>
                  ))}
                </ChartLegend>
              )}
              <ChartSurface label={`Item win rate by ${purchaseAxis} chart`} size="lg" variant="flush">
                <LineChart margin={{ ...CHART_MARGIN, right: 16, bottom: 16, left: 12 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis
                    {...CHART_AXIS}
                    dataKey="displayBucket"
                    domain={dataRange}
                    type="number"
                    tickCount={config.tickCount}
                    tickFormatter={config.formatter}
                    label={{ ...CHART_TICK, value: config.label, position: "insideBottom", offset: -8 }}
                  />
                  <YAxis
                    {...CHART_AXIS}
                    domain={[(min: number) => Math.max(0, min - 10), (max: number) => Math.min(100, max + 10)]}
                    label={{ ...CHART_TICK, value: "Win Rate (%)", angle: -90, position: "insideLeft" }}
                    tickFormatter={(v) => `${v?.toFixed(0)}%`}
                    tickCount={10}
                  />
                  <Tooltip
                    cursor={CHART_CURSOR_LINE}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <TooltipCard>
                          {payload.map((entry) => {
                            const d = entry.payload as ChartPoint;
                            return (
                              <Fragment key={`${entry.name} ${d.bucketStart}-${d.bucketEnd}`}>
                                <TooltipHeader
                                  leading={<ChartSwatch shape="line" color={entry.color ?? CHART_COLOR.neutral} />}
                                  title={entry.name}
                                  subtitle={`${config.tooltipPrefix} ${config.formatter(d.bucketStart)} - ${config.formatter(d.bucketEnd)}`}
                                />
                                <TooltipStats>
                                  <TooltipStat
                                    label={useWilsonInterval ? "Conservative Estimate" : "True Win Rate"}
                                    value={`${d.winrate === null ? "-" : d.winrate.toFixed(1)}%`}
                                  />
                                  {useWilsonInterval && (
                                    <TooltipStat
                                      label="True Win Rate"
                                      value={`${d.trueWinrate === null ? "-" : d.trueWinrate.toFixed(1)}%`}
                                    />
                                  )}
                                  <TooltipStat label="Matches" value={d.matches.toLocaleString("en-US")} />
                                </TooltipStats>
                              </Fragment>
                            );
                          })}
                        </TooltipCard>
                      );
                    }}
                  />
                  {itemIds.map((itemId, index) => (
                    <Line
                      key={itemId}
                      dataKey="winrate"
                      data={(chartData as unknown as Record<string, { winrate: number | null }[]>)[itemId]}
                      type="monotone"
                      stroke={seriesColor(index)}
                      dot={{ r: 3, fill: seriesColor(index), strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                      strokeWidth={2}
                      name={itemNameMap?.[itemId]}
                    />
                  ))}
                </LineChart>
              </ChartSurface>
            </>
          )}
        </div>
      </ChartCard>
    </TooltipProvider>
  );
}
