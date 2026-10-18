import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartsMore } from "~/components/dev/design-system/ChartsMore";
import { ChartsRadar } from "~/components/dev/design-system/ChartsRadar";
import { Round3PatternsCharts } from "~/components/dev/design-system/Round3PatternsCharts";
import { percent } from "~/components/dev/design-system/samples";
import { Chapter, Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { ChartCard } from "~/components/patterns/charts/ChartCard";
import { ChartDataTable } from "~/components/patterns/charts/ChartDataTable";
import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { ChartReading, ChartReadingList, ChartReadings } from "~/components/patterns/charts/ChartReadings";
import { ChartReveal, ChartRevealBack, ChartRevealFront } from "~/components/patterns/charts/ChartReveal";
import { ChartEmpty, ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import { GaussianComparison } from "~/components/patterns/charts/GaussianComparison";
import {
  CHART_BASELINE,
  CHART_COLOR,
  chartMarkColor,
  CHART_CURSOR_BAND,
  CHART_CURSOR_LINE,
  CHART_GRID,
  CHART_MARGIN,
  CHART_SHADED_WINDOW,
  CHART_STACK_SEGMENT,
  CHART_X_AXIS,
  CHART_X_AXIS_CATEGORY,
  CHART_X_AXIS_SM,
  CHART_Y_AXIS,
  SERIES_COLORS,
  thinTicks,
} from "~/components/patterns/charts/theme";
import { TONE_COLOR, toneOf } from "~/lib/tone";

/** A dark entity color, the kind a rank can have (Initiate is a deep brown). */
const MARK_DARK = "var(--ink-700)";

const SERIES = ["Infernus", "Haze", "Seven", "Paradox"];
const WEEKS = Array.from({ length: 10 }, (_, week) => ({
  label: `W${week + 1}`,
  ...Object.fromEntries(SERIES.map((name, i) => [name, 0.5 + Math.sin((week + i * 2) / 2.2) * 0.03 + i * 0.006])),
}));
function ThinnedAxisDemo() {
  const [plotWidth, setPlotWidth] = useState(0);
  return (
    <ChartSurface label="Weekly win rate, every other week labelled when narrow" size="sm" onResize={setPlotWidth}>
      <LineChart data={WEEKS} margin={CHART_MARGIN}>
        <XAxis
          {...CHART_X_AXIS}
          dataKey="label"
          ticks={thinTicks(
            WEEKS.map((week) => week.label),
            plotWidth,
            64,
          )}
          interval={0}
        />
        <Line dataKey="Infernus" isAnimationActive={false} dot={false} />
      </LineChart>
    </ChartSurface>
  );
}

function InfernusWeeks({ className }: { className?: string }) {
  return (
    <ChartDataTable
      caption="Infernus win rate by week"
      head={["Week", "Infernus"]}
      rows={WEEKS.map((week) => ({
        key: week.label,
        cells: [week.label, percent((week as Record<string, number | string>).Infernus as number)],
      }))}
      className={className}
    />
  );
}

const BY_RANK = ["Initiate", "Seeker", "Alchemist", "Arcanist", "Ritualist", "Emissary", "Archon", "Oracle"].map(
  (rank, i) => {
    const winRate = 0.47 + i * 0.009 + (i % 3) * 0.004;
    // Recharts colours each bar from its data point's `fill`.
    return { rank, winRate, fill: TONE_COLOR[toneOf(winRate, 0.5)] };
  },
);

export function Charts() {
  return (
    <Chapter
      id="charts"
      intro="Every Recharts plot sits in a ChartSurface and takes its grid, axes, baseline, cursor and colors from patterns/charts/theme. One y-axis per chart; a legend for two or more series; text stays in ink."
    >
      <Specimen
        name="Series palette"
        source="patterns/charts/theme · SERIES_COLORS"
        note="Assigned by fixed index and never cycled. The order is validated for colorblind separation between neighbours. A bar filled with an entity color (a rank, a hero) goes through chartMarkColor, which lifts a dark color to the 3:1 lightness floor."
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
          <ChartLegendItem color={MARK_DARK} shape="square">
            a dark entity color
          </ChartLegendItem>
          <ChartLegendItem color={chartMarkColor(MARK_DARK)} shape="square">
            chartMarkColor(it)
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
              <XAxis dataKey="label" {...CHART_X_AXIS} />
              <YAxis domain={[0.44, 0.58]} tickFormatter={percent} {...CHART_Y_AXIS} />
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
        note="size: xs, sm, md, default, lg, xl (the main plot of a page), fill (the parent sets the height), grow (grows in a stretched panel from a compact minimum; its loading skeleton too), stretch (the default height as a floor, grown to a stretched panel: two panels side by side keep their x-axes on one line when one has a taller header). variant: card, flush, bare. The loading skeleton takes the same size. announce: plot (the label names the figure and the focusable chart svg; keyboard readings in TooltipCard are announced politely) or label (the label summarises a small plot, which is hidden from screen readers; the bare one here)."
      >
        <Variants className="grid items-start md:grid-cols-2">
          <ChartSurface label="Win rate by rank" size="md">
            <BarChart data={BY_RANK} margin={CHART_MARGIN}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="rank" {...CHART_X_AXIS} interval={0} tickFormatter={(rank: string) => rank.slice(0, 3)} />
              <YAxis domain={[0.44, 0.56]} tickFormatter={percent} {...CHART_Y_AXIS} />
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
              />
            </BarChart>
          </ChartSurface>
          <div className="flex flex-col gap-3">
            <ChartSurface
              label="Rolling win rate for Infernus by week, hovering around 50 percent"
              announce="label"
              size="sm"
              variant="bare"
              dataTable={<InfernusWeeks />}
            >
              <AreaChart data={WEEKS} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} accessibilityLayer={false}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis dataKey="label" {...CHART_X_AXIS_SM} />
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
          {/* A panel stretched to a taller neighbour: the grow plot takes the height, the legend stays under it. */}
          <div className="flex h-56 flex-col gap-2">
            <ChartSurface label="Weekly matches, grown to its panel" size="grow" variant="flush">
              <BarChart data={BY_RANK} margin={CHART_MARGIN}>
                <XAxis
                  dataKey="rank"
                  {...CHART_X_AXIS}
                  interval={0}
                  tickFormatter={(rank: string) => rank.slice(0, 3)}
                />
                <YAxis domain={[0.44, 0.56]} tickFormatter={percent} {...CHART_Y_AXIS} />
                <Bar dataKey="winRate" radius={4} isAnimationActive={false} />
              </BarChart>
            </ChartSurface>
            <ChartLoading label="grown plot" size="grow" />
          </div>
          {/* Two panels in one row, one with a picker above its plot: stretch keeps their x-axes level. */}
          <div className="grid grid-cols-2 items-stretch gap-2">
            {[false, true].map((picker) => (
              <div key={String(picker)} className="flex flex-col gap-2">
                {picker && <span className="text-xs text-muted-foreground">A taller header</span>}
                <ChartSurface label="Win rate by rank, stretched" size="stretch" variant="flush">
                  <BarChart data={BY_RANK} margin={CHART_MARGIN}>
                    <XAxis
                      dataKey="rank"
                      {...CHART_X_AXIS}
                      interval={0}
                      tickFormatter={(rank: string) => rank.slice(0, 3)}
                    />
                    <YAxis domain={[0.44, 0.56]} tickFormatter={percent} {...CHART_Y_AXIS} />
                    <Bar dataKey="winRate" radius={4} isAnimationActive={false} />
                  </BarChart>
                </ChartSurface>
              </div>
            ))}
          </div>
        </Variants>
      </Specimen>

      <Specimen
        name="Category and thinned axes"
        source="patterns/charts/theme"
        note="CHART_X_AXIS_CATEGORY labels every category (Recharts would drop some from the end on a narrow plot). thinTicks(ticks, plotWidth) keeps every k-th tick so a long axis stays evenly labelled; pass interval={0} and the width from ChartSurface onResize. spacedTicks([min, median, max]) drops an inner value tick that would print on an edge one (a median next to the minimum)."
      >
        <Variants className="grid items-start md:grid-cols-2">
          <ChartSurface label="Win rate by rank, every rank labelled" size="sm">
            <BarChart data={BY_RANK} margin={CHART_MARGIN}>
              <XAxis {...CHART_X_AXIS_CATEGORY} dataKey="rank" tickFormatter={(rank: string) => rank.slice(0, 3)} />
              <Bar dataKey="winRate" isAnimationActive={false} />
            </BarChart>
          </ChartSurface>
          <ThinnedAxisDemo />
        </Variants>
      </Specimen>

      <Specimen
        name="ChartDataTable"
        source="patterns/charts/ChartDataTable"
        note="The numbers behind a plot that announce=label hides from screen readers: ChartSurface's dataTable slot, one row a point (its name is the row header), one column a series. Visually hidden; shown here with not-sr-only."
      >
        <Variants>
          <InfernusWeeks className="not-sr-only text-xs" />
        </Variants>
      </Specimen>

      <Specimen
        name="Stacked bars"
        source="patterns/charts/theme · CHART_STACK_SEGMENT"
        note="Every Bar with a stackId spreads CHART_STACK_SEGMENT: a 1px rim in the surface color between the segments, so two neighbours of similar hue still read as two parts."
      >
        <ChartSurface label="Soul sources by rank, stacked" size="sm" variant="flush" className="max-w-md">
          <BarChart data={BY_RANK} margin={CHART_MARGIN}>
            <XAxis dataKey="rank" {...CHART_X_AXIS} interval={0} tickFormatter={(rank: string) => rank.slice(0, 3)} />
            <YAxis {...CHART_Y_AXIS} hide />
            {[0.5, 0.3, 0.2].map((share, i) => (
              <Bar
                key={share}
                dataKey={(row: (typeof BY_RANK)[number]) => row.winRate * share}
                stackId="parts"
                fill={SERIES_COLORS[i]}
                isAnimationActive={false}
                {...CHART_STACK_SEGMENT}
              />
            ))}
          </BarChart>
        </ChartSurface>
      </Specimen>

      <Specimen
        name="Shaded window"
        source="patterns/charts/theme · CHART_SHADED_WINDOW"
        note="A span of the x axis (a respawn wait): ReferenceArea with fill and stroke in one color and CHART_SHADED_WINDOW spread on it, a faint fill edged in the color. Its legend key is ChartSwatch shape=band in the same color, so key and mark match."
      >
        <Variants className="flex-col items-start gap-2">
          <ChartSurface
            label="Win rate by rank with two shaded windows"
            size="sm"
            variant="flush"
            className="w-full max-w-md"
          >
            <LineChart data={BY_RANK} margin={CHART_MARGIN}>
              <XAxis dataKey="rank" {...CHART_X_AXIS} interval={0} tickFormatter={(rank: string) => rank.slice(0, 3)} />
              <YAxis {...CHART_Y_AXIS} hide domain={["dataMin", "dataMax"]} />
              {[
                ["Seeker", "Alchemist"],
                ["Archon", "Oracle"],
              ].map(([x1, x2]) => (
                <ReferenceArea
                  key={x1}
                  x1={x1}
                  x2={x2}
                  fill={CHART_COLOR.negative}
                  stroke={CHART_COLOR.negative}
                  {...CHART_SHADED_WINDOW}
                />
              ))}
              <Line dataKey="winRate" stroke={SERIES_COLORS[3]} dot={false} isAnimationActive={false} />
            </LineChart>
          </ChartSurface>
          <ChartLegend>
            <ChartLegendItem color={CHART_COLOR.negative} shape="band">
              Dead
            </ChartLegendItem>
          </ChartLegend>
        </Variants>
      </Specimen>

      <Specimen
        name="ChartLegend"
        source="patterns/charts/ChartLegend"
        note="Two or more series always get one. shape matches the mark: line, square or dot. state pending keeps a series that is refetching in the legend, its swatch faded, so the legend never re-wraps."
      >
        <ChartLegend>
          <ChartLegendItem color={CHART_COLOR.reference} shape="dashed" state="pending">
            Pending reference
          </ChartLegendItem>
          <ChartLegendItem color={SERIES_COLORS[0]} shape="line">
            Line series
          </ChartLegendItem>
          <ChartLegendItem color={SERIES_COLORS[1]} shape="square">
            Bar series
          </ChartLegendItem>
          <ChartLegendItem color={SERIES_COLORS[2]} shape="dot">
            Point series
          </ChartLegendItem>
          <ChartLegendItem color={CHART_COLOR.reference} shape="dashed">
            Median (CHART_MEDIAN_LINE)
          </ChartLegendItem>
          <ChartLegendItem color={CHART_COLOR.reference} shape="dotted">
            Quartiles (CHART_QUARTILE_LINE)
          </ChartLegendItem>
          <ChartLegendItem color={CHART_COLOR.neutral} shape="band">
            Spread band
          </ChartLegendItem>
        </ChartLegend>
      </Specimen>

      <Specimen
        name="ChartReadings"
        source="patterns/charts/ChartReadings"
        note="The tooltip body of every chart: a title and aligned label/value rows, scrollable when there are many. size sm is the tight card for small multiples, where a tooltip must not cover the neighbouring plots; there the title can be left out when the plot is titled."
      >
        <Variants label="size: default, sm" className="items-start">
          <ChartReadings title="Week of 2026-09-07">
            <ChartReading label="Win rate">52.4%</ChartReading>
            <ChartReading label="Pick rate">8.1%</ChartReading>
            <ChartReading label="Matches">84,120</ChartReading>
          </ChartReadings>
          <ChartReadings size="sm">
            <ChartReading label="Bananas Only" color="var(--chart-1)">
              3.29 · P78
            </ChartReading>
            <ChartReading label="Clankers" color="var(--chart-2)">
              2.52 · P61
            </ChartReading>
          </ChartReadings>
        </Variants>
      </Specimen>

      <Specimen
        name="GaussianComparison"
        source="patterns/charts/GaussianComparison"
        note="Two distributions as normal curves fitted to a mean and a standard deviation: the subject in a series color over a dashed, neutral reference, each with a line at its mean. Approximations from two moments, not histograms. Without a spread it shows the means only; without any mean it says the distribution is unavailable. bounded keeps a rate under 1."
      >
        <Variants label="Value against reference · a rate (bounded) · means only" className="items-start">
          <GaussianComparison
            className="w-64"
            value={{ avg: 6.4, std: 3.1 }}
            reference={{ avg: 5.6, std: 3.3 }}
            label="Kills of a build against its hero"
          />
          <GaussianComparison
            className="w-64"
            value={{ avg: 0.39, std: 0.06 }}
            reference={{ avg: 0.36, std: 0.07 }}
            bounded
            format={(x) => `${Math.round(x * 100)}%`}
            label="Accuracy against the lobby"
          />
          <GaussianComparison
            className="w-64"
            value={{ avg: 21000 }}
            reference={{ avg: 19800 }}
            label="Souls, means only"
          />
        </Variants>
      </Specimen>

      <Specimen
        name="ChartReveal"
        source="patterns/charts/ChartReveal"
        note="A small multiple that turns into its numbers: hover or focus the tile and the plot (ChartRevealFront) cross-fades into its readings (ChartRevealBack, usually a ChartReadingList size sm) in the same box, so no tooltip lies over the neighbouring plots. One tab stop; the back is hidden from assistive technology, so the front's ChartSurface summary must carry the numbers."
      >
        <Variants label="Hover or focus the tile" className="items-start">
          <ChartReveal aria-label="Infernus win rate, weekly readings" className="w-64">
            <ChartRevealFront>
              <ChartSurface
                label="Infernus win rate over ten weeks, between 47% and 53%"
                announce="label"
                size="sm"
                variant="bare"
              >
                <AreaChart data={WEEKS} margin={CHART_MARGIN} accessibilityLayer={false}>
                  <XAxis dataKey="label" {...CHART_X_AXIS} />
                  <Area
                    dataKey="Infernus"
                    stroke={SERIES_COLORS[0]}
                    fill={SERIES_COLORS[0]}
                    fillOpacity={0.15}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ChartSurface>
            </ChartRevealFront>
            <ChartRevealBack>
              <ChartReadingList size="sm" extra>
                <ChartReading label="Latest week" color={SERIES_COLORS[0]} extra="W10">
                  51.2%
                </ChartReading>
                <ChartReading label="Best week" color={SERIES_COLORS[0]} extra="W4">
                  53.0%
                </ChartReading>
                <ChartReading label="Worst week" color={SERIES_COLORS[0]} extra="W8">
                  47.1%
                </ChartReading>
              </ChartReadingList>
            </ChartRevealBack>
          </ChartReveal>
        </Variants>
      </Specimen>

      <Specimen name="Chart states" source="patterns/charts/ChartStates">
        <Variants className="grid items-start md:grid-cols-2">
          <ChartError label="hero trends" onRetry={() => {}} retrying={false} />
          <ChartEmpty label="hero trends" />
          <ChartEmpty label="buff pickup times" description="Pickup times are recorded since the September update." />
          <ChartEmpty
            size="md"
            label="hero trends"
            title="Choose heroes to compare"
            description="Select heroes in the picker or use Show all to display their trends."
          />
        </Variants>
      </Specimen>

      <ChartsMore />
      <Round3PatternsCharts />
      <ChartsRadar />
    </Chapter>
  );
}
