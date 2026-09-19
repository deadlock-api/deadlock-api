import { MetricSelect } from "~/components/analytics/MetricSelect";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { HERO_TREND_LABELS } from "~/lib/hero-trends";
import { HERO_STATS, HERO_STATS_WITH_BAN_RATE, TIME_INTERVALS } from "~/types/api_hero_stats";

export function HeroStatSelector<T extends readonly string[]>({
  value,
  onChange,
  options,
  label,
}: {
  value: T[number];
  onChange: (val: T[number]) => void;
  options?: T;
  label: string;
}) {
  const items = options ?? HERO_STATS;
  if (items.length > 7) {
    return (
      <MetricSelect
        value={value}
        onChange={onChange}
        label={label}
        groups={[
          {
            label: "Hero metrics",
            options: items.map((key) => ({
              value: key,
              label:
                HERO_TREND_LABELS[key as keyof typeof HERO_TREND_LABELS] ??
                key.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase()),
            })),
          },
        ]}
      />
    );
  }
  return (
    <ToggleGroup
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(val) => val && onChange(val)}
      variant="outline"
      className="flex-wrap"
    >
      {items.map((key) => (
        <ToggleGroupItem key={key as string} value={key as string} className="text-xs capitalize">
          {(key as string).replace(/_/g, " ")}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function HeroTimeIntervalSelector({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (val: string) => void;
  label: string;
}) {
  return (
    <ToggleGroup
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(val) => val && onChange(val)}
      variant="outline"
    >
      {TIME_INTERVALS.map((key) => (
        <ToggleGroupItem key={key.label} value={key.query} className="text-xs capitalize">
          {key.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export const BY_RANK_STATS = [...HERO_STATS_WITH_BAN_RATE, "pickrate"] as const;
export type ByRankStat = (typeof BY_RANK_STATS)[number];
