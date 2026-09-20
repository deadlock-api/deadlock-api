import { ChartNoAxesCombined } from "lucide-react";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { ChartCard } from "~/components/patterns/charts/ChartCard";
import { ChartSidebarLayout } from "~/components/patterns/charts/ChartSidebarLayout";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import { MetricSelect } from "~/components/patterns/charts/MetricSelect";
import StatTrendChart, { type StatTrendBucket } from "~/components/patterns/charts/StatTrendChart";
import {
  CHART_AXIS,
  CHART_BASELINE,
  CHART_GRID,
  CHART_MARGIN,
  SERIES_COLORS,
} from "~/components/patterns/charts/theme";
import { TrendIntervalField } from "~/components/patterns/charts/TrendControls";
import { type WeekEntry, WeeklyTrendChart } from "~/components/patterns/charts/WeeklyTrendChart";
import { FilterBar } from "~/components/patterns/filter-bar/FilterBar";
import { Card } from "~/components/ui/card";
import { Field } from "~/components/ui/field";
import { OptionRow } from "~/components/ui/option-row";
import { SegmentedItem } from "~/components/ui/segmented";
import { SelectGroup, SelectItem, SelectLabel } from "~/components/ui/select";
import type { StatTrendPoint } from "~/lib/stat-format";

const METRIC_LABELS: Record<string, string> = {
  win_rate: "Win rate",
  pick_rate: "Pick rate",
  ban_rate: "Ban rate",
  kills: "Kills per match",
  deaths: "Deaths per match",
  player_damage: "Player damage per minute",
};
const metricOptions = (
  <>
    <SelectGroup>
      <SelectLabel>Outcome</SelectLabel>
      <SelectItem value="win_rate">{METRIC_LABELS.win_rate}</SelectItem>
      <SelectItem value="pick_rate">{METRIC_LABELS.pick_rate}</SelectItem>
      <SelectItem value="ban_rate">{METRIC_LABELS.ban_rate}</SelectItem>
    </SelectGroup>
    <SelectGroup>
      <SelectLabel>Combat</SelectLabel>
      <SelectItem value="kills">{METRIC_LABELS.kills}</SelectItem>
      <SelectItem value="deaths">{METRIC_LABELS.deaths}</SelectItem>
      <SelectItem value="player_damage">{METRIC_LABELS.player_damage}</SelectItem>
    </SelectGroup>
  </>
);
const INTERVALS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
] as const;

const HOUR = 3_600_000;
const FIRST_BUCKET = Date.UTC(2026, 6, 6);
const BUCKET_SERIES: Record<StatTrendBucket, { step: number; count: number }> = {
  start_time_hour: { step: HOUR, count: 48 },
  start_time_day: { step: 24 * HOUR, count: 30 },
  start_time_week: { step: 7 * 24 * HOUR, count: 10 },
  start_time_month: { step: 30 * 24 * HOUR, count: 6 },
};

function trendPoints(bucket: StatTrendBucket): StatTrendPoint[] {
  const { step, count } = BUCKET_SERIES[bucket];
  return Array.from({ length: count }, (_, i) => ({
    date: FIRST_BUCKET + i * step,
    value: 0.51 + Math.sin(i / 2.4) * 0.018 + i * 0.0006,
    matches: 8000 + ((i * 1777) % 3000),
  }));
}

const WEEKS: WeekEntry[] = Array.from({ length: 10 }, (_, i) => {
  const weekStart = FIRST_BUCKET / 1000 + i * 7 * 24 * 3600;
  const date = new Date(weekStart * 1000);
  return {
    weekStart,
    label: `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}`,
    winRate: 0.505 + Math.sin(i / 1.7) * 0.022,
    share: 0.062 + Math.cos(i / 2.1) * 0.014 + i * 0.002,
    matches: 61000 + ((i * 7919) % 9000),
  };
});

const HEROES = ["Infernus", "Haze", "Seven", "Paradox", "Abrams", "Bebop", "Dynamo", "Kelvin", "Lash", "Wraith"];
const HERO_WEEKS = WEEKS.map((week, w) => ({
  label: week.label,
  ...Object.fromEntries(HEROES.map((hero, h) => [hero, 0.5 + Math.sin((w + h * 3) / 2.3) * 0.03 + (h % 4) * 0.004])),
}));
const percent = (value: number) => `${Math.round(value * 100)}%`;

export function ChartsMore() {
  const [metric, setMetric] = useState("win_rate");
  const [interval, setInterval] = useState("week");
  const [bucket, setBucket] = useState<StatTrendBucket>("start_time_day");
  const [visible, setVisible] = useState(HEROES.slice(0, 3));

  const toggleHero = (hero: string) =>
    setVisible(visible.includes(hero) ? visible.filter((name) => name !== hero) : [...visible, hero]);
  const stat = { label: "Win rate", format: "percent" } as const;

  return (
    <>
      <Specimen
        name="MetricSelect"
        source="patterns/charts/MetricSelect"
        note="A small Select of grouped metrics, for option sets too large for a Segmented. The options are SelectGroup / SelectLabel / SelectItem children; valueLabel names the selected one on the trigger during SSR. Disabled until hydration because its value usually comes from the URL."
      >
        <Variants>
          <MetricSelect
            value={metric}
            valueLabel={METRIC_LABELS[metric]}
            onValueChange={setMetric}
            label="Example metric"
          >
            {metricOptions}
          </MetricSelect>
        </Variants>
      </Specimen>

      <Specimen
        name="Trend fields"
        source="patterns/charts/TrendControls"
        note="The fields of a historical chart's toolbar: a MetricSelect and the time interval, inside a FilterBar toolbar. They hold no URL state; the route passes values and setters."
      >
        <FilterBar variant="toolbar" title="Hero trends" icon={ChartNoAxesCombined} aria-label="Trend controls">
          <Field label="Metric" orientation="horizontal" className="w-full @sm:w-auto">
            <MetricSelect value={metric} valueLabel={METRIC_LABELS[metric]} onValueChange={setMetric}>
              {metricOptions}
            </MetricSelect>
          </Field>
          <TrendIntervalField value={interval} onValueChange={setInterval}>
            {INTERVALS.map((option) => (
              <SegmentedItem key={option.value} value={option.value}>
                {option.label}
              </SegmentedItem>
            ))}
          </TrendIntervalField>
        </FilterBar>
      </Specimen>

      <Specimen
        name="ChartSidebarLayout"
        source="patterns/charts/ChartSidebarLayout"
        note="A chart beside an entity picker. From lg up the chart sets the height and the 18rem sidebar scrolls inside it; below lg the sidebar stacks under the chart."
      >
        <ChartSidebarLayout
          sidebar={
            <Card size="flush" className="max-h-56 gap-0 overflow-y-auto p-1 lg:max-h-none">
              {HEROES.map((hero) => (
                <OptionRow key={hero} selected={visible.includes(hero)} onClick={() => toggleHero(hero)}>
                  {hero}
                </OptionRow>
              ))}
            </Card>
          }
        >
          <ChartCard title="Win rate over time" description={`${visible.length} selected`}>
            <ChartSurface label="Win rate over time for the selected heroes" size="md" variant="flush">
              <LineChart data={HERO_WEEKS} margin={CHART_MARGIN}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis dataKey="label" {...CHART_AXIS} />
                <YAxis domain={[0.44, 0.58]} tickFormatter={percent} width={44} {...CHART_AXIS} />
                <ReferenceLine y={0.5} {...CHART_BASELINE} />
                {HEROES.map(
                  (hero, i) =>
                    visible.includes(hero) && (
                      <Line
                        key={hero}
                        dataKey={hero}
                        stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    ),
                )}
              </LineChart>
            </ChartSurface>
          </ChartCard>
        </ChartSidebarLayout>
      </Specimen>

      <Specimen
        name="StatTrendChart"
        source="patterns/charts/StatTrendChart"
        note="One stat over time with its own interval switch, sized for a hover card or a dialog. The caller fetches; the chart draws the pending, error and empty states itself."
      >
        <Variants className="grid items-start md:grid-cols-2">
          {(
            [
              ["data", trendPoints(bucket), "ready"],
              ["loading", [], "loading"],
              ["error", [], "error"],
              ["no complete buckets", [{ date: FIRST_BUCKET, value: null }], "ready"],
            ] as const
          ).map(([label, data, state]) => (
            <div key={label} className="flex min-w-0 flex-col gap-1.5">
              <span className="eyebrow">{label}</span>
              <Card size="sm" className="px-3">
                <StatTrendChart data={[...data]} state={state} stat={stat} value={bucket} onValueChange={setBucket} />
              </Card>
            </div>
          ))}
        </Variants>
      </Specimen>

      <Specimen
        name="WeeklyTrendChart"
        source="patterns/charts/WeeklyTrendChart"
        note="Win rate and a share (pick or purchase rate) by week, as two plots on one synced week axis: each measure keeps its own scale without a second y-axis."
      >
        <WeeklyTrendChart weeks={WEEKS} shareLabel="Pick rate" label="Infernus win rate and pick rate by week" />
      </Specimen>
    </>
  );
}
