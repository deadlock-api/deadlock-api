import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import { ChartNoAxesCombined } from "lucide-react";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent } from "~/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader } from "~/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { day } from "~/dayjs";
import { computePerformanceTrend, performanceWindow } from "~/lib/tracker/compute";

import { DashboardPanel } from "./DashboardPanel";

const metrics = {
  winrate: {
    label: "Win rate",
    color: "var(--victory)",
    format: (value: number) => `${(value * 100).toFixed(1)}%`,
    description: "Wins / matches. Dashed line: 50% win rate.",
  },
  kdaRatio: {
    label: "KDA",
    color: "var(--chart-4)",
    format: (value: number) => value.toFixed(2),
    description: "Total kills + assists / deaths in each window. With no deaths, shows kills + assists.",
  },
  soulsPerMin: {
    label: "Souls / min",
    color: "var(--chart-3)",
    format: (value: number) => Math.round(value).toLocaleString("en-US"),
    description: "Total souls / total minutes played in each window.",
  },
};
type Metric = keyof typeof metrics;
const metricKeys = Object.keys(metrics) as Metric[];
const windows = ["auto", "5", "10", "20", "50"] as const;
type WindowChoice = (typeof windows)[number];
const axis = { fontSize: 9, fill: "var(--muted-foreground)" };

export function PerformanceTrendPanel({ entries }: { entries: PlayerMatchHistoryEntry[] }) {
  const [metric, setMetric] = useState<Metric>("winrate");
  const [windowChoice, setWindowChoice] = useState<WindowChoice>("auto");
  const window = windowChoice === "auto" ? performanceWindow(entries.length) : Number(windowChoice);
  const points = useMemo(() => computePerformanceTrend(entries, window), [entries, window]);
  const selected = metrics[metric];
  const latest = points.at(-1);

  return (
    <DashboardPanel title="Performance trend" icon={ChartNoAxesCombined} meta={`Rolling ${window} matches`}>
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={metric}
            onValueChange={(value) => {
              if (metricKeys.includes(value as Metric)) setMetric(value as Metric);
            }}
            aria-label="Performance metric"
          >
            {metricKeys.map((key) => (
              <ToggleGroupItem key={key} value={key} className="h-7 px-2">
                {metrics[key].label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <ToggleGroup
            type="single"
            size="sm"
            value={windowChoice}
            onValueChange={(value) => {
              if (windows.includes(value as WindowChoice)) setWindowChoice(value as WindowChoice);
            }}
            aria-label="Rolling window size"
          >
            {windows.map((choice) => (
              <ToggleGroupItem
                key={choice}
                value={choice}
                className="h-7 px-2"
                aria-label={choice === "auto" ? "Automatic window size" : `${choice} matches`}
                title={choice === "auto" ? "Window grows with your selected match history" : `${choice}-match window`}
              >
                {choice === "auto" ? "Auto" : choice}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="flex flex-wrap items-baseline gap-2" aria-live="polite" aria-atomic="true">
          <span className="text-lg font-semibold tabular-nums">{latest ? selected.format(latest[metric]) : "—"}</span>
          <span className="text-[10px] text-muted-foreground">
            {selected.label} · latest {window} selected matches
          </span>
        </div>
        {points.length === 0 ? (
          <Empty className="min-h-24 border p-3 md:p-3">
            <EmptyHeader>
              <EmptyDescription>
                {entries.length} of {window} matches available. Choose a smaller window or broaden your filters.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ChartContainer config={metrics} className="aspect-auto h-24 w-full">
            <AreaChart
              data={points}
              margin={{ top: 4, right: 2, left: 2, bottom: 0 }}
              accessibilityLayer
              aria-label={`Rolling ${window}-match ${selected.label.toLowerCase()} over selected matches`}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="time"
                tickFormatter={(time: number) => day.unix(time).format("MMM D")}
                tick={axis}
                axisLine={false}
                tickLine={false}
                minTickGap={35}
                height={18}
              />
              <YAxis domain={metric === "winrate" ? [0, 1] : [0, "auto"]} hide />
              {metric === "winrate" && <ReferenceLine y={0.5} stroke="var(--muted-foreground)" strokeDasharray="3 4" />}
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_label, payload) =>
                      day.unix(payload[0].payload.time).format("MMM D, YYYY · HH:mm")
                    }
                    formatter={(value) => (
                      <span>
                        {selected.label} <strong>{selected.format(Number(value))}</strong> · {window} matches
                      </span>
                    )}
                  />
                }
              />
              <Area
                key={metric}
                dataKey={metric}
                type="monotone"
                stroke={selected.color}
                fill={selected.color}
                fillOpacity={0.12}
                strokeWidth={1.5}
                dot={points.length === 1}
                isAnimationActive={false}
              />
            </AreaChart>
          </ChartContainer>
        )}
        <p className="text-[10px] text-muted-foreground">{selected.description}</p>
      </div>
    </DashboardPanel>
  );
}
