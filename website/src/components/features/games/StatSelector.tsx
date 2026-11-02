import { MetricSelect } from "~/components/patterns/charts/MetricSelect";
import { TrendIntervalField } from "~/components/patterns/charts/TrendControls";
import { SegmentedItem } from "~/components/ui/segmented";
import { SelectGroup, SelectItem, SelectLabel } from "~/components/ui/select";
import { getFilteredCategories, getStatDefinition } from "~/lib/game-stat-definitions";

/** The one picker of the `stat` URL parameter, in the page's filter row on every tab that plots a game stat. */
export function StatSelector({
  value,
  onChange,
  isStreetBrawl = false,
}: {
  value: string;
  onChange: (val: string) => void;
  isStreetBrawl?: boolean;
}) {
  return (
    <MetricSelect value={value} valueLabel={getStatDefinition(value)?.label} onValueChange={onChange} label="Metric">
      <GameMetricOptions isStreetBrawl={isStreetBrawl} />
    </MetricSelect>
  );
}

/** The trend chart's time buckets: the interval picker offers them, the chart names its points by them. */
export const GAME_TIME_BUCKETS = [
  { value: "start_time_day", label: "Day", one: "day", other: "days" },
  { value: "start_time_week", label: "Week", one: "week", other: "weeks" },
  { value: "start_time_month", label: "Month", one: "month", other: "months" },
] as const;

/** The over-time chart's interval, for the page's filter row. */
export function GameTimeBucketField({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <TrendIntervalField value={value} onValueChange={onValueChange}>
      {GAME_TIME_BUCKETS.map((entry) => (
        <SegmentedItem key={entry.value} value={entry.value}>
          {entry.label}
        </SegmentedItem>
      ))}
    </TrendIntervalField>
  );
}

/** The game stats a metric select offers, grouped by category; Street Brawl leaves out what that mode has no data for. */
export function GameMetricOptions({ isStreetBrawl }: { isStreetBrawl: boolean }) {
  return getFilteredCategories(isStreetBrawl).map((category) => (
    <SelectGroup key={category.label}>
      <SelectLabel>{category.label}</SelectLabel>
      {category.stats.map((stat) => (
        <SelectItem key={stat.key} value={stat.key}>
          {stat.label}
        </SelectItem>
      ))}
    </SelectGroup>
  ));
}
