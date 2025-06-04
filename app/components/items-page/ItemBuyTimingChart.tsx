import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { ChartContainer, ChartTooltip } from "~/components/ui/chart";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { type ItemStatsQueryParams, itemStatsQueryOptions } from "~/queries/item-stats-query";

const chartConfig = {
  winrate: {
    label: "Win Rate",
    color: "hsl(var(--chart-1))",
  },
  ema: {
    label: "Moving Average",
    color: "hsl(var(--chart-3))",
  },
};

type BucketType = "game_time_min" | "net_worth_thousands";

// Calculate Wilson interval lower bound for 95% confidence
function wilsonLowerBound(wins: number, total: number): number {
  if (total === 0) return 0;
  const p = wins / total;
  const n = total;
  const z = 1.96; // 95% confidence

  const numerator = p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  const denominator = 1 + (z * z) / n;

  return Math.max(0, numerator / denominator);
}

function movingAverage(arr: Array<number | null | undefined>, window: number): Array<number | null> {
  const n = arr.length;
  const result = new Array<number | null>(n);
  const half = Math.floor(window / 2);

  // Find start of data (first non-null)
  let firstDataIdx = 0;
  while (firstDataIdx < n && (arr[firstDataIdx] === null || arr[firstDataIdx] === undefined)) {
    firstDataIdx++;
  }

  // Find end of data (last non-null)
  let lastDataIdx = n - 1;
  while (lastDataIdx >= 0 && (arr[lastDataIdx] === null || arr[lastDataIdx] === undefined)) {
    lastDataIdx--;
  }

  for (let i = 0; i < n; i++) {
    if (i < firstDataIdx || i > lastDataIdx) {
      // Leading or trailing null/undefined runs
      result[i] = null;
      continue;
    }

    const start = Math.max(0, i - half);
    const end = Math.min(n - 1, i + half);
    let sum = 0;
    let count = 0;

    for (let j = start; j <= end; j++) {
      const val = arr[j];
      if (val !== null && val !== undefined) {
        sum += val;
        count++;
      }
    }
    result[i] = count > 0 ? sum / count : null;
  }
  return result;
}

// Calculate simple moving average
function calculateSMA(data: Array<{ winrate: number | null }>, windowSize = 5): Array<number | null> {
  return movingAverage(
    data.map((d) => d.winrate),
    windowSize,
  );
}

const MIN_MATCHES_PERCENTAGE_OF_TOTAL = 0.02;

// Configuration for different bucket types
const BUCKET_CONFIG = {
  game_time_min: {
    label: "Minutes",
    range: [0, 45] as [number, number],
    tickCount: 12,
    formatter: (value: number) => `${Math.round(value)}`,
    tooltipPrefix: "Minute",
  },
  net_worth_thousands: {
    label: "Net Worth",
    range: [0, 100] as [number, number], // Assuming reasonable range, will be dynamic based on data
    tickCount: 10,
    formatter: (value: number) => `${Math.round(value)}K`,
    tooltipPrefix: "Net Worth",
  },
} as const;

interface ItemBuyTimingChartProps {
  itemId: number;
  baseQueryOptions: Omit<ItemStatsQueryParams, "bucket">;
  rowTotalMatches: number;
}

export default function ItemBuyTimingChart({ itemId, baseQueryOptions, rowTotalMatches }: ItemBuyTimingChartProps) {
  const [useWilsonInterval, setUseWilsonInterval] = useState(false);
  const [bucketType, setBucketType] = useState<BucketType>("net_worth_thousands");

  const minMatches = Math.min(1, Math.floor(rowTotalMatches * MIN_MATCHES_PERCENTAGE_OF_TOTAL));

  const queryOptions = useMemo(
    () => ({
      ...baseQueryOptions,
      bucket: bucketType,
      minMatches: 1,
    }),
    [baseQueryOptions, bucketType],
  );

  const { data, isLoading } = useQuery(itemStatsQueryOptions(queryOptions));

  // Create chart data based on bucket type
  const chartData = useMemo(() => {
    const itemData = data?.filter((d) => d.item_id === itemId) || [];

    if (itemData.length === 0) {
      return [];
    }

    // Determine the range based on actual data
    const buckets = itemData
      .map((d) => d.bucket)
      .filter((b) => typeof b === "number")
      .sort((a, b) => a - b);
    const minBucket = buckets[0] || 0;
    const maxBucket = buckets[buckets.length - 1] || (bucketType === "game_time_min" ? 45 : 100);

    // Create data points for the full range
    const chartPoints = [];
    for (let bucket = minBucket; bucket <= maxBucket; bucket++) {
      const dataPoint = itemData.find((d) => d.bucket === bucket);
      if (!dataPoint || dataPoint.matches < minMatches) {
        chartPoints.push({
          bucket,
          winrate: null,
          trueWinrate: null,
          wilsonLowerBound: null,
          matches: dataPoint?.matches || 0,
          ema: null,
        });
        continue;
      }

      const trueWinrate = (dataPoint.wins / dataPoint.matches) * 100;
      const wilsonLower = wilsonLowerBound(dataPoint.wins, dataPoint.matches) * 100;

      chartPoints.push({
        bucket,
        winrate: useWilsonInterval ? wilsonLower : trueWinrate,
        trueWinrate,
        wilsonLowerBound: wilsonLower,
        matches: dataPoint.matches,
        ema: null,
      });
    }

    // Calculate SMA and add to the data
    const smaValues = calculateSMA(chartPoints);

    return chartPoints.map((point, index) => ({
      ...point,
      ema: smaValues[index],
    }));
  }, [data, itemId, useWilsonInterval, minMatches, bucketType]);

  const config = BUCKET_CONFIG[bucketType];

  // Determine actual range from data for better chart display
  const dataRange = useMemo((): [number, number] => {
    const validData = chartData.filter((d) => d.winrate !== null);
    if (validData.length === 0) return config.range;

    const minValue = Math.min(...validData.map((d) => d.bucket));
    const maxValue = Math.max(...validData.map((d) => d.bucket));
    return [Math.max(0, minValue - 1), maxValue + 1];
  }, [chartData, config.range]);

  const hasValidData = !isLoading && chartData.filter((d) => d.winrate !== null).length > 0;

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
              onValueChange={(value) => {
                if (value) setBucketType(value as BucketType);
              }}
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem value="net_worth_thousands" className="px-6">
                Net Worth
              </ToggleGroupItem>
              <ToggleGroupItem value="game_time_min" className="px-6">
                Time
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex items-center space-x-2">
            <Switch id="wilson-interval" checked={useWilsonInterval} onCheckedChange={setUseWilsonInterval} />
            <Label htmlFor="wilson-interval" className="text-sm">
              Use Wilson Interval Lower Bound (95% confidence)
            </Label>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        ) : !hasValidData ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">No data available</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <LineChart
              data={chartData}
              width={undefined}
              height={undefined}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="bucket"
                domain={dataRange}
                type="number"
                tickCount={config.tickCount}
                tickFormatter={config.formatter}
                label={{ value: config.label, position: "insideBottom", offset: -5 }}
              />
              <YAxis
                domain={[
                  (dataMin: number) => Math.max(0, dataMin - 5),
                  (dataMax: number) => Math.min(100, dataMax + 5),
                ]}
                label={{ value: "Win Rate (%)", angle: -90, position: "insideLeft" }}
                tickFormatter={(value) => `${value.toFixed(0)}%`}
              />
              <ChartTooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="border-border/50 bg-background grid min-w-[8rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
                        <div className="font-medium">
                          {config.tooltipPrefix} {config.formatter(data.bucket)}
                        </div>
                        <div className="grid gap-1.5">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-gray-500" />
                            <span className="text-muted-foreground">
                              {useWilsonInterval ? "Wilson Lower Bound:" : "True Win Rate:"}
                            </span>
                            <span className="font-mono font-medium">{Number(data.winrate).toFixed(1)}%</span>
                          </div>
                          {useWilsonInterval && (
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-gray-300" />
                              <span className="text-muted-foreground">True Win Rate:</span>
                              <span className="font-mono font-medium">{Number(data.trueWinrate).toFixed(1)}%</span>
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-gray-400" />
                            <span className="text-muted-foreground">Matches:</span>
                            <span className="font-mono font-medium">{data.matches}</span>
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
              <Line
                type="monotone"
                dataKey="ema"
                stroke="var(--chart-2)"
                strokeWidth={3}
                strokeDasharray="5 5"
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
