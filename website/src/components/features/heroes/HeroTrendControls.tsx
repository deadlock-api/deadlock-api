import { ChartNoAxesCombined } from "lucide-react";

import { TrendIntervalField, TrendMetricField } from "~/components/patterns/charts/TrendControls";
import { FilterBar } from "~/components/patterns/filter-bar/FilterBar";
import { SegmentedItem } from "~/components/ui/segmented";
import { SelectGroup, SelectItem, SelectLabel } from "~/components/ui/select";
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
    <FilterBar variant="toolbar" title="Hero trends" icon={ChartNoAxesCombined} aria-label="Trend controls">
      <TrendMetricField
        value={stat}
        valueLabel={HERO_TREND_LABELS[stat]}
        onValueChange={(value) => onStatChange(value as HeroTrendStat)}
      >
        {METRIC_GROUPS.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.stats.map((value) => (
              <SelectItem key={value} value={value}>
                {HERO_TREND_LABELS[value]}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </TrendMetricField>
      <TrendIntervalField value={interval} onValueChange={onIntervalChange}>
        {intervals.map((entry) => (
          <SegmentedItem key={entry.value} value={entry.value}>
            {entry.label}
          </SegmentedItem>
        ))}
      </TrendIntervalField>
    </FilterBar>
  );
}
