import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { ChartContainer, ChartTooltip } from "~/components/ui/chart";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
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

interface ItemBuyTimingChartProps {
  itemId: number;
  baseQueryOptions: Omit<ItemStatsQueryParams, "bucket">;
  rowTotalMatches: number;
}

export default function ItemBuyTimingChart({ itemId, baseQueryOptions, rowTotalMatches }: ItemBuyTimingChartProps) {
  const [useWilsonInterval, setUseWilsonInterval] = useState(false);

  const minMatches = Math.max(10, Math.floor(rowTotalMatches * MIN_MATCHES_PERCENTAGE_OF_TOTAL));
  // Add bucket parameter to the base query options (no server-side minMatches filtering)
  const queryOptions = useMemo(
    () => ({
      ...baseQueryOptions,
      bucket: "game_time_min" as const,
      minMatches: 5,
    }),
    [baseQueryOptions],
  );

  const { data, isLoading } = useQuery(itemStatsQueryOptions(queryOptions));

  // Create simple minute-by-minute chart data
  const chartData = useMemo(() => {
    const itemData = data?.filter((d) => d.item_id === itemId) || [];

    // Create minute-by-minute data
    const minuteData = Array.from({ length: 46 }, (_, minute) => {
      const dataPoint = itemData.find((d) => d.bucket === minute);
      if (!dataPoint || dataPoint.matches < minMatches) {
        return {
          minute,
          winrate: null,
          trueWinrate: null,
          wilsonLowerBound: null,
          matches: dataPoint?.matches || 0,
          ema: null,
        };
      }

      const trueWinrate = (dataPoint.wins / dataPoint.matches) * 100;
      const wilsonLower = wilsonLowerBound(dataPoint.wins, dataPoint.matches) * 100;

      return {
        minute,
        winrate: useWilsonInterval ? wilsonLower : trueWinrate,
        trueWinrate,
        wilsonLowerBound: wilsonLower,
        matches: dataPoint.matches,
        ema: null,
      };
    });

    // Calculate SMA and add to the data
    const smaValues = calculateSMA(minuteData);

    return minuteData.map((point, index) => ({
      ...point,
      ema: smaValues[index],
    }));
  }, [data, itemId, useWilsonInterval, minMatches]);

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </CardContent>
      </Card>
    );
  }

  if (chartData.filter((d) => d.winrate !== null).length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Buy Timing Analysis</CardTitle>
          <CardDescription>Win rate by purchase time</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-48">
          <p className="text-muted-foreground">No data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Buy Timing Analysis</CardTitle>
        <CardDescription>Win rate by purchase time (minute-by-minute)</CardDescription>
        <div className="flex items-center space-x-2 mt-3">
          <Switch id="wilson-interval" checked={useWilsonInterval} onCheckedChange={setUseWilsonInterval} />
          <Label htmlFor="wilson-interval" className="text-sm">
            Use Wilson Interval Lower Bound (95% confidence)
          </Label>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <LineChart
            data={chartData}
            width={undefined}
            height={undefined}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="minute"
              domain={[0, 45]}
              type="number"
              tickCount={12}
              tickFormatter={(value) => `${Math.round(value)}`}
              label={{ value: "Minutes", position: "insideBottom", offset: -5 }}
            />
            <YAxis
              domain={[(dataMin: number) => Math.max(0, dataMin - 5), (dataMax: number) => Math.min(100, dataMax + 5)]}
              label={{ value: "Win Rate (%)", angle: -90, position: "insideLeft" }}
              tickFormatter={(value) => `${value.toFixed(0)}%`}
            />
            <ChartTooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="border-border/50 bg-background grid min-w-[8rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
                      <div className="font-medium">Minute {data.minute}</div>
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
      </CardContent>
    </Card>
  );
}
