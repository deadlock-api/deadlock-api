import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiItemStatsRequest } from "deadlock_api_client";
import { parseAsBoolean, parseAsStringLiteral, useQueryState } from "nuqs";
import { Fragment, useMemo } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { ChartCard } from "~/components/patterns/charts/ChartCard";
import { ChartLegend, ChartLegendItem, ChartSwatch } from "~/components/patterns/charts/ChartLegend";
import { ChartLoading } from "~/components/patterns/charts/ChartStates";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_COLOR,
  CHART_CURSOR_LINE,
  CHART_GRID,
  CHART_MARGIN,
  CHART_TICK,
  CHART_X_AXIS,
  CHART_X_LABEL,
  CHART_Y_AXIS,
  CHART_Y_LABEL,
  SERIES_COLORS,
} from "~/components/patterns/charts/theme";
import { PanelBody } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { Field } from "~/components/ui/field";
import { NoValue } from "~/components/ui/no-value";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Separator } from "~/components/ui/separator";
import { Inline } from "~/components/ui/stack";
import { SwitchField } from "~/components/ui/switch-field";
import {
  Tooltip as HoverTooltip,
  TooltipCard,
  TooltipHeader,
  TooltipProvider,
  TooltipStat,
  TooltipStats,
} from "~/components/ui/tooltip";
import { hasSoulEconomy } from "~/lib/game-mode";
import { wilsonScoreInterval } from "~/lib/wilson";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";

const VIEW_OPTIONS = [
  { value: "net_worth_by_1000", label: "Net Worth" },
  { value: "game_time_min", label: "Time" },
  { value: "game_time_normalized_percentage", label: "Time (Relative)" },
] as const;

type BucketType = Exclude<AnalyticsApiItemStatsRequest["bucket"], undefined>;
type ChartData = Record<string, ChartPoint[]>;

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

/** The start of the interval of this width that holds the bucket (a bucket of `null` counts as 0). */
function intervalStart(bucket: number | null, increment: number): number {
  return Math.floor((bucket ?? 0) / increment) * increment;
}

/** The matches per interval of this width, over the intervals that have any rows. */
function computeAverageMatchCount(itemData: { bucket: number | null; matches: number }[], increment: number): number {
  const intervals = new Set(itemData.map((point) => intervalStart(point.bucket, increment)));
  const totalMatches = itemData.reduce((sum, point) => sum + point.matches, 0);
  return totalMatches / intervals.size;
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
    // Buckets are a share of the match length (0-100%), not minutes.
    label: "Match Progress",
    formatter: (v: number) => `${Math.round(v)}%`,
    tooltipPrefix: "Match progress",
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
    if (itemData.length === 0) continue;

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
      const key = intervalStart(point.bucket, increment);
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
      const wilson = Math.max(0, wilsonScoreInterval(group.wins, group.matches)[0]) * 100;
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
  // In the URL like the page's filters, so a reload or a shared link keeps the chart as it was set.
  const [showFineGrainedIntervals, setShowFineGrainedIntervals] = useQueryState(
    "buy_fine",
    parseAsBoolean.withDefault(false),
  );
  const [useWilsonInterval, setUseWilsonInterval] = useQueryState("buy_wilson", parseAsBoolean.withDefault(true));
  const [chosenBucketType, setBucketType] = useQueryState(
    "buy_bucket",
    parseAsStringLiteral(Object.keys(BUCKET_CONFIG) as (keyof typeof BUCKET_CONFIG)[]).withDefault("net_worth_by_1000"),
  );
  // Street Brawl hands out fixed souls per round, so net worth at purchase says nothing there: it views by time, and the
  // URL keeps the choice for when the mode changes back.
  const showEconomy = hasSoulEconomy(baseQueryOptions.gameMode);
  const bucketType = showEconomy || chosenBucketType !== "net_worth_by_1000" ? chosenBucketType : "game_time_min";
  const viewOptions = showEconomy
    ? VIEW_OPTIONS
    : VIEW_OPTIONS.filter((option) => option.value !== "net_worth_by_1000");

  const baseMinAvgThreshold = rowTotalMatches && rowTotalMatches > 200 ? MIN_AVG_THRESHOLD : MIN_AVG_THRESHOLD * 1.5;
  const minAvgThreshold = showFineGrainedIntervals ? baseMinAvgThreshold / 2 : baseMinAvgThreshold;
  const minMatches = rowTotalMatches && rowTotalMatches > 500 ? 20 : rowTotalMatches && rowTotalMatches > 250 ? 10 : 2;

  const { data: itemsData } = useQuery(itemUpgradesQueryOptions);
  const itemNameMap = useMemo(
    () => (itemsData ? new Map(itemsData.map((item) => [item.id, item.name])) : undefined),
    [itemsData],
  );

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

  const purchaseAxis = {
    game_time_min: "purchase time",
    game_time_normalized_percentage: "purchase time relative to match length",
    net_worth_by_1000: "net worth at purchase",
  }[bucketType];
  const seriesColor = (index: number) => SERIES_COLORS[index] ?? CHART_COLOR.neutral;

  return (
    <TooltipProvider>
      <ChartCard title="Purchase Analysis" description={`Win rate by ${purchaseAxis}`} className="w-full">
        <PanelBody size="sm">
          <Inline className="gap-x-4 gap-y-2">
            <Field label="View by" orientation="horizontal">
              <Segmented value={bucketType} onValueChange={setBucketType} width="hug">
                {viewOptions.map((option) => (
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
        {/* Nothing picked needs no data: the server, which never fetches it here, shows the same prompt. */}
        <div aria-live="polite" aria-busy={isLoading && itemIds.length > 0}>
          {itemIds.length === 0 ? (
            <EmptyState
              variant="plain"
              title="Pick one or more items above"
              description="to compare how their win rate changes with when they are bought."
            />
          ) : isLoading ? (
            <div className="p-2">
              <ChartLoading label="purchase analysis" size="lg" />
            </div>
          ) : !hasValidData ? (
            <EmptyState variant="plain" title="No data available" />
          ) : (
            <>
              {itemIds.length > 1 && (
                <ChartLegend className="px-3 pt-2">
                  {itemIds.map((itemId, index) => (
                    <ChartLegendItem key={itemId} color={seriesColor(index)} shape="line">
                      {itemNameMap?.get(itemId) ?? `Item ${itemId}`}
                    </ChartLegendItem>
                  ))}
                </ChartLegend>
              )}
              <ChartSurface label={`Item win rate by ${purchaseAxis} chart`} size="lg" variant="flush">
                <LineChart margin={{ ...CHART_MARGIN, right: 16 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis
                    {...CHART_X_AXIS}
                    dataKey="displayBucket"
                    domain={dataRange}
                    type="number"
                    tickCount={config.tickCount}
                    tickFormatter={config.formatter}
                    label={{ ...CHART_X_LABEL, ...CHART_TICK, value: config.label }}
                  />
                  <YAxis
                    {...CHART_Y_AXIS}
                    domain={[(min: number) => Math.max(0, min - 10), (max: number) => Math.min(100, max + 10)]}
                    label={{ ...CHART_Y_LABEL, ...CHART_TICK, value: "Win Rate (%)" }}
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
                                    value={
                                      d.winrate === null ? <NoValue label="No matches" /> : `${d.winrate.toFixed(1)}%`
                                    }
                                  />
                                  {useWilsonInterval && (
                                    <TooltipStat
                                      label="True Win Rate"
                                      value={
                                        d.trueWinrate === null ? (
                                          <NoValue label="No matches" />
                                        ) : (
                                          `${d.trueWinrate.toFixed(1)}%`
                                        )
                                      }
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
                      data={chartData[itemId] ?? []}
                      type="monotone"
                      stroke={seriesColor(index)}
                      dot={{ r: 3, fill: seriesColor(index), strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                      strokeWidth={2}
                      name={itemNameMap?.get(itemId)}
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
