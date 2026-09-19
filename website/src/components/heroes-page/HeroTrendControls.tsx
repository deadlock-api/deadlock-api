import { TrendControls } from "~/components/analytics/TrendControls";
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
    <TrendControls
      title="Hero trends"
      metric={stat}
      metricGroups={metricGroups}
      onMetricChange={(value) => onStatChange(value as HeroTrendStat)}
      interval={interval}
      intervals={intervals}
      onIntervalChange={onIntervalChange}
    />
  );
}
