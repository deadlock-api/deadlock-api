import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { ChartContainer, ChartTooltip } from "~/components/ui/chart";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { type ItemStatsQueryParams, itemStatsQueryOptions } from "~/queries/item-stats-query";

const chartConfig = {
  winrate: { label: "Win Rate", color: "hsl(var(--chart-1))" },
  ema: { label: "Moving Average", color: "hsl(var(--chart-3))" },
};

type BucketType = Exclude<ItemStatsQueryParams["bucket"], undefined>;

const MIN_AVG_THRESHOLD = 0.1; // 5 %
const BUCKET_INCREMENTS = [1000, 2000, 3000, 5000, 7000, 10000] as const;

function wilsonLowerBound(wins: number, total: number) {
  if (total === 0) return 0;
  const p = wins / total;
  const n = total;
  const z = 1.96;
  const numerator = p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  const denominator = 1 + (z * z) / n;
  return Math.max(0, numerator / denominator);
}

function movingAverage(arr: Array<number | null | undefined>, window: number) {
  const n = arr.length;
  const result = new Array<number | null>(n);
  const half = Math.floor(window / 2);
  let first = 0;
  while (first < n && (arr[first] === null || arr[first] === undefined)) first++;
  let last = n - 1;
  while (last >= 0 && (arr[last] === null || arr[last] === undefined)) last--;
  for (let i = 0; i < n; i++) {
    if (i < first || i > last) {
      result[i] = null;
      continue;
    }
    const s = Math.max(0, i - half);
    const e = Math.min(n - 1, i + half);
    let sum = 0;
    let count = 0;
    for (let j = s; j <= e; j++) {
      const v = arr[j];
      if (v !== null && v !== undefined) {
        sum += v;
        count++;
      }
    }
    result[i] = count ? sum / count : null;
  }
  return result;
}

function calculateSMA(data: Array<{ winrate: number | null }>, windowSize: number) {
  return movingAverage(
    data.map((d) => d.winrate),
    windowSize,
  );
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
} as const satisfies Partial<Record<BucketType, unknown>>;

interface ItemBuyTimingChartProps {
  itemId: number;
  baseQueryOptions: Omit<ItemStatsQueryParams, "bucket">;
  rowTotalMatches: number;
}

export default function ItemBuyTimingChart({ itemId, baseQueryOptions, rowTotalMatches }: ItemBuyTimingChartProps) {
  const [showFineGrainedIntervals, setShowFineGrainedIntervals] = useState(false);
  const [useWilsonInterval, setUseWilsonInterval] = useState(false);
  const [bucketType, setBucketType] = useState<keyof typeof BUCKET_CONFIG>("net_worth_by_1000");

  const baseMinAvgThreshold = rowTotalMatches > 200 ? MIN_AVG_THRESHOLD : MIN_AVG_THRESHOLD * 1.5;
  const minAvgThreshold = showFineGrainedIntervals ? baseMinAvgThreshold / 2 : baseMinAvgThreshold;
  const minMatches = rowTotalMatches > 500 ? 20 : rowTotalMatches > 250 ? 10 : 2;

  const queryOptions = useMemo(
    () => ({ ...baseQueryOptions, bucket: bucketType, minMatches }),
    [baseQueryOptions, bucketType, minMatches],
  );

  const { data, isLoading } = useQuery(itemStatsQueryOptions(queryOptions));

  const chartData = useMemo(() => {
    const itemData = data?.filter((d) => d.item_id === itemId) || [];
    if (itemData.length === 0) return [];

    const bucketIncrements =
      bucketType === "net_worth_by_1000" ? BUCKET_INCREMENTS : BUCKET_INCREMENTS.map((inc) => inc / 1000);

    let increment = bucketIncrements[bucketIncrements.length - 1];
    for (const inc of bucketIncrements) {
      const avgMatches = computeAverageMatchCount(itemData, inc);
      const avgPercent = avgMatches / rowTotalMatches;
      if (avgPercent >= minAvgThreshold) {
        increment = inc;
        console.log(
          `increment: ${inc}, because ${avgPercent} >= ${minAvgThreshold} (value is ${avgMatches} / ${rowTotalMatches})`,
        );
        break;
      }
      console.log(
        `NOT increment: ${inc}, because ${avgPercent} < ${minAvgThreshold} (value is ${avgMatches} / ${rowTotalMatches})`,
      );
    }

    const groups = new Map<number, { matches: number; wins: number }>();
    for (const p of itemData) {
      const key = Math.floor((p.bucket as number) / increment) * increment;
      const g = groups.get(key) || { matches: 0, wins: 0 };
      g.matches += p.matches;
      g.wins += p.wins;
      groups.set(key, g);
    }

    const keys = Array.from(groups.keys()).sort((a, b) => a - b);
    const pts: Array<{
      bucket: number;
      displayBucket: number;
      bucketStart: number;
      bucketEnd: number;
      winrate: number | null;
      trueWinrate: number | null;
      wilsonLowerBound: number | null;
      matches: number;
      ema: number | null;
    }> = [];

    for (const k of keys) {
      // biome-ignore lint/style/noNonNullAssertion: <explanation>
      const g = groups.get(k)!;
      const bucketStart = k;
      const bucketEnd = k + increment;
      const displayBucket = k + increment / 2; // Center the dot in the middle of the bucket range

      if (!g.matches) {
        pts.push({
          bucket: k,
          displayBucket,
          bucketStart,
          bucketEnd,
          winrate: null,
          trueWinrate: null,
          wilsonLowerBound: null,
          matches: 0,
          ema: null,
        });
        continue;
      }
      const trueWR = (g.wins / g.matches) * 100;
      const wilson = wilsonLowerBound(g.wins, g.matches) * 100;
      pts.push({
        bucket: k,
        displayBucket,
        bucketStart,
        bucketEnd,
        winrate: useWilsonInterval ? wilson : trueWR,
        trueWinrate: trueWR,
        wilsonLowerBound: wilson,
        matches: g.matches,
        ema: null,
      });
    }

    const sma = calculateSMA(pts, increment);
    return pts.map((p, i) => ({ ...p, ema: sma[i] }));
  }, [data, itemId, useWilsonInterval, minAvgThreshold, rowTotalMatches, bucketType]);

  const config = BUCKET_CONFIG[bucketType];

  const dataRange = useMemo<[number, number]>(() => {
    const valid = chartData.filter((d) => d.winrate !== null);
    if (!valid.length) return [0, 1];
    const min = Math.min(...valid.map((d) => d.displayBucket));
    const max = Math.max(...valid.map((d) => d.displayBucket));
    return [Math.max(0, min - 1), max + 1];
  }, [chartData]);

  const hasValidData = !isLoading && chartData.some((d) => d.winrate !== null && d.matches > 0);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Purchase Analysis</CardTitle>
        <CardDescription>
          Win rate by {bucketType === "game_time_min" ? "purchase time" : "net worth at purchase"}
        </CardDescription>
        <div className="flex flex-col space-y-3 mt-3">
          <div className="flex flex-col space-y-2">
            <Label className="text-sm font-medium">View by:</Label>
            <ToggleGroup
              type="single"
              value={bucketType}
              onValueChange={(v) => v && setBucketType(v as keyof typeof BUCKET_CONFIG)}
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem value="net_worth_by_1000" className="px-6">
                Net Worth
              </ToggleGroupItem>
              <ToggleGroupItem value="game_time_min" className="px-6">
                Time
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex items-center space-x-2">
            <Switch id="wilson-interval" checked={useWilsonInterval} onCheckedChange={setUseWilsonInterval} />
            <Label htmlFor="wilson-interval" className="text-sm flex items-center gap-1">
              Use conservative win-rate estimate based on volume
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="icon-[material-symbols--info] h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs bg-background text-foreground p-4 text-center text-pretty space-y-2">
                  <p>
                    Less matches played for a datapoint means we're less confident in the win rate, so we reduce it a
                    bit to compensate.
                  </p>
                </TooltipContent>
              </Tooltip>
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="fine-grained"
              checked={showFineGrainedIntervals}
              onCheckedChange={setShowFineGrainedIntervals}
            />
            <Label htmlFor="fine-grained" className="text-sm">
              Show fine grained intervals
            </Label>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        ) : !hasValidData ? (
          <div className="flex items-center justify-center h-96">
            <p className="text-muted-foreground">No data available</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-96 w-full">
            <LineChart
              data={chartData}
              width={undefined}
              height={undefined}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="displayBucket"
                domain={dataRange}
                type="number"
                tickCount={config.tickCount}
                tickFormatter={config.formatter}
                label={{ value: config.label, position: "insideBottom", offset: -5 }}
              />
              <YAxis
                domain={[(min: number) => Math.max(0, min - 10), (max: number) => Math.min(100, max + 10)]}
                label={{ value: "Win Rate (%)", angle: -90, position: "insideLeft" }}
                tickFormatter={(v) => `${v.toFixed(0)}%`}
                tickCount={10}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="border-border/50 bg-background grid min-w-[8rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
                        <div className="font-medium">
                          {config.tooltipPrefix} {config.formatter(d.bucketStart)} - {config.formatter(d.bucketEnd)}
                        </div>
                        <div className="grid gap-1.5">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-gray-500" />
                            <span className="text-muted-foreground">
                              {useWilsonInterval ? "Wilson Lower Bound:" : "True Win Rate:"}
                            </span>
                            <span className="font-mono font-medium">
                              {d.winrate === null ? "-" : d.winrate.toFixed(1)}%
                            </span>
                          </div>
                          {useWilsonInterval && (
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-gray-300" />
                              <span className="text-muted-foreground">True Win Rate:</span>
                              <span className="font-mono font-medium">
                                {d.trueWinrate === null ? "-" : d.trueWinrate.toFixed(1)}%
                              </span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-gray-400" />
                            <span className="text-muted-foreground">Matches:</span>
                            <span className="font-mono font-medium">{d.matches}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Line
                type="monotone"
                dataKey="winrate"
                stroke="var(--chart-1)"
                strokeWidth={1}
                dot={{ r: 3, fill: "var(--chart-1)" }}
                connectNulls={false}
                isAnimationActive={false}
              />
              {/* TODO: Add moving average later, but for now it just clutters the chart */}
              {/* <Line
                type="monotone"
                dataKey="ema"
                stroke="var(--chart-2)"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              /> */}
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
