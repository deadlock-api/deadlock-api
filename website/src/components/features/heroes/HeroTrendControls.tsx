import { TrendControls, TrendIntervalField, TrendMetricField } from "~/components/patterns/charts/TrendControls";
import { SegmentedItem } from "~/components/ui/segmented";
import { HERO_TREND_LABELS, type HeroTrendStat } from "~/lib/hero-trends";
import { TIME_INTERVALS } from "~/types/api_hero_stats";

const METRIC_GROUPS = [
  { label: "Performance", stats: ["winrate", "ban_rate"] },
  { label: "Match volume", stats: ["matches", "wins", "losses"] },
  {
    label: "Combat & economy",
    stats: [
      "kills_per_match",
      "deaths_per_match",
      "assists_per_match",
      "net_worth_per_match",
      "last_hits_per_match",
      "denies_per_match",
    ],
  },
] as const;

const metricGroups = METRIC_GROUPS.map((group) => ({
  label: group.label,
  options: group.stats.map((value) => ({ value, label: HERO_TREND_LABELS[value] })),
}));
const intervals = TIME_INTERVALS.map((interval) => ({ value: interval.query, label: interval.label }));

export function HeroTrendControls({
  stat,
  interval,
  onStatChange,
  onIntervalChange,
}: {
  stat: HeroTrendStat;
  interval: string;
  onStatChange: (stat: HeroTrendStat) => void;
  onIntervalChange: (interval: string) => void;
}) {
  return (
    <TrendControls title="Hero trends">
      <TrendMetricField
        value={stat}
        groups={metricGroups}
        onValueChange={(value) => onStatChange(value as HeroTrendStat)}
      />
      <TrendIntervalField value={interval} onValueChange={onIntervalChange}>
        {intervals.map((entry) => (
          <SegmentedItem key={entry.value} value={entry.value}>
            {entry.label}
          </SegmentedItem>
        ))}
      </TrendIntervalField>
    </TrendControls>
  );
}
