import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartsMore } from "~/components/dev/design-system/ChartsMore";
import { Round3PatternsCharts } from "~/components/dev/design-system/Round3PatternsCharts";
import { Chapter, Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { ChartCard } from "~/components/patterns/charts/ChartCard";
import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { ChartReading, ChartReadings } from "~/components/patterns/charts/ChartReadings";
import { ChartEmpty, ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_AXIS,
  CHART_AXIS_SM,
  CHART_BASELINE,
  CHART_COLOR,
  CHART_CURSOR_BAND,
  CHART_CURSOR_LINE,
  CHART_GRID,
  CHART_MARGIN,
  SERIES_COLORS,
} from "~/components/patterns/charts/theme";
import { TONE_COLOR, toneOf } from "~/lib/tone";

const SERIES = ["Infernus", "Haze", "Seven", "Paradox"];
const WEEKS = Array.from({ length: 10 }, (_, week) => ({
  label: `W${week + 1}`,
  ...Object.fromEntries(SERIES.map((name, i) => [name, 0.5 + Math.sin((week + i * 2) / 2.2) * 0.03 + i * 0.006])),
}));
const BY_RANK = ["Initiate", "Seeker", "Alchemist", "Arcanist", "Ritualist", "Emissary", "Archon", "Oracle"].map(
  (rank, i) => ({ rank, winRate: 0.47 + i * 0.009 + (i % 3) * 0.004 }),
);
const percent = (v: number) => `${Math.round(v * 100)}%`;

export function Charts() {
  return (
    <Chapter
      id="charts"
      title="Charts"
      intro="Every Recharts plot sits in a ChartSurface and takes its grid, axes, baseline, cursor and colors from patterns/charts/theme. One y-axis per chart; a legend for two or more series; text stays in ink."
    >
      <Specimen
        name="Series palette"
        source="patterns/charts/theme · SERIES_COLORS"
        note="Assigned by fixed index and never cycled. The order is validated for colorblind separation between neighbours."
      >
        <ChartLegend>
          {SERIES_COLORS.map((color, i) => (
            <ChartLegendItem key={color} color={color}>{`chart-${i + 1}`}</ChartLegendItem>
          ))}
          <ChartLegendItem color={CHART_COLOR.winRate} shape="line">
            winRate
          </ChartLegendItem>
          <ChartLegendItem color={CHART_COLOR.share} shape="line">
            share
          </ChartLegendItem>
          <ChartLegendItem color={CHART_COLOR.positive} shape="dot">
            positive
          </ChartLegendItem>
          <ChartLegendItem color={CHART_COLOR.negative} shape="dot">
            negative
          </ChartLegendItem>
        </ChartLegend>
      </Specimen>

      <Specimen
        name="ChartCard"
        source="patterns/charts/ChartCard"
        note="Title strip, plot and footer. The plot inside is a flush ChartSurface; hover it for the ChartReadings tooltip."
      >
        <ChartCard
          title="Win rate over time"
          description="Last 10 weeks · UTC"
          actions={
            <ChartLegend>
              {SERIES.map((label, i) => (
                <ChartLegendItem key={label} color={SERIES_COLORS[i]} shape="line">
                  {label}
                </ChartLegendItem>
              ))}
            </ChartLegend>
          }
          footer="Weeks with fewer than 100 matches are left as gaps."
        >
          <ChartSurface label="Win rate over time for four heroes" variant="flush">
            <LineChart data={WEEKS} margin={CHART_MARGIN}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="label" {...CHART_AXIS} />
              <YAxis domain={[0.44, 0.58]} tickFormatter={percent} width={44} {...CHART_AXIS} />
              <ReferenceLine y={0.5} {...CHART_BASELINE} />
              <Tooltip
                isAnimationActive={false}
                cursor={CHART_CURSOR_LINE}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <ChartReadings title={`Week ${String(label).slice(1)}`}>
                      {payload.map((entry) => (
                        <ChartReading key={String(entry.name)} label={String(entry.name)}>
                          {percent(Number(entry.value))}
                        </ChartReading>
                      ))}
                    </ChartReadings>
                  ) : null
                }
              />
              {SERIES.map((name, i) => (
                <Line
                  key={name}
                  dataKey={name}
                  stroke={SERIES_COLORS[i]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ChartSurface>
        </ChartCard>
      </Specimen>

      <Specimen
        name="ChartSurface"
        source="patterns/charts/ChartSurface"
        note="size: xs, sm, md, default, lg, xl (the main plot of a page), fill. variant: card, flush, bare. The loading skeleton takes the same size. announce: plot (the label names it) or label (the label summarises a small plot, which is hidden from screen readers; the bare one here)."
      >
        <Variants className="grid items-start md:grid-cols-2">
          <ChartSurface label="Win rate by rank" size="md">
            <BarChart data={BY_RANK} margin={CHART_MARGIN}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="rank" {...CHART_AXIS} interval={0} tickFormatter={(rank: string) => rank.slice(0, 3)} />
              <YAxis domain={[0.44, 0.56]} tickFormatter={percent} width={44} {...CHART_AXIS} />
              <ReferenceLine y={0.5} {...CHART_BASELINE} />
              <Tooltip
                isAnimationActive={false}
                cursor={CHART_CURSOR_BAND}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <ChartReadings title={payload[0].payload.rank}>
                      <ChartReading label="Win rate">{percent(payload[0].payload.winRate)}</ChartReading>
                    </ChartReadings>
                  ) : null
                }
              />
              <Bar
                dataKey={(entry: (typeof BY_RANK)[number]) => [0.5, entry.winRate]}
                radius={4}
                isAnimationActive={false}
              >
                {BY_RANK.map((entry) => (
                  <Cell key={entry.rank} fill={TONE_COLOR[toneOf(entry.winRate, 0.5)]} />
                ))}
              </Bar>
            </BarChart>
          </ChartSurface>
          <div className="flex flex-col gap-3">
            <ChartSurface
              label="Rolling win rate for Infernus by week, hovering around 50 percent"
              announce="label"
              size="sm"
              variant="bare"
            >
              <AreaChart data={WEEKS} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} accessibilityLayer={false}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis dataKey="label" height={16} {...CHART_AXIS_SM} />
                <YAxis hide domain={[0.44, 0.58]} />
                <ReferenceLine y={0.5} {...CHART_BASELINE} />
                <Area
                  dataKey="Infernus"
                  stroke={CHART_COLOR.positive}
                  fill={CHART_COLOR.positive}
                  fillOpacity={0.15}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ChartSurface>
            <ChartLoading label="trend" size="sm" />
          </div>
        </Variants>
      </Specimen>

      <Specimen
        name="ChartLegend"
        source="patterns/charts/ChartLegend"
        note="Two or more series always get one. shape matches the mark: line, square or dot."
      >
        <ChartLegend>
          <ChartLegendItem color={SERIES_COLORS[0]} shape="line">
            Line series
          </ChartLegendItem>
          <ChartLegendItem color={SERIES_COLORS[1]} shape="square">
            Bar series
          </ChartLegendItem>
          <ChartLegendItem color={SERIES_COLORS[2]} shape="dot">
            Point series
          </ChartLegendItem>
        </ChartLegend>
      </Specimen>

      <Specimen
        name="ChartReadings"
        source="patterns/charts/ChartReadings"
        note="The tooltip body of every chart: a title and aligned label/value rows, scrollable when there are many."
      >
        <ChartReadings title="Week of 2026-09-07">
          <ChartReading label="Win rate">52.4%</ChartReading>
          <ChartReading label="Pick rate">8.1%</ChartReading>
          <ChartReading label="Matches">84,120</ChartReading>
        </ChartReadings>
      </Specimen>

      <Specimen name="Chart states" source="patterns/charts/ChartStates">
        <Variants className="grid items-start md:grid-cols-2">
          <ChartError label="hero trends" onRetry={() => {}} retrying={false} />
          <ChartEmpty label="hero trends" />
        </Variants>
      </Specimen>

      <ChartsMore />
      <Round3PatternsCharts />
    </Chapter>
  );
}
