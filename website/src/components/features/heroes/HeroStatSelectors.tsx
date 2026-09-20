import { MetricSelect } from "~/components/patterns/charts/MetricSelect";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
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
        onValueChange={onChange}
        label={label}
        groups={[
          {
            label: "Hero metrics",
            options: items.map((key) => ({
              value: key,
              label:
                (key === "pickrate" ? "Pick rate" : HERO_TREND_LABELS[key as keyof typeof HERO_TREND_LABELS]) ??
                key.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase()),
            })),
          },
        ]}
      />
    );
  }
  return (
    <Segmented aria-label={label} width="hug" value={value} onValueChange={onChange}>
      {items.map((key: T[number]) => (
        <SegmentedItem key={key} value={key}>
          <span className="capitalize">{key.replace(/_/g, " ")}</span>
        </SegmentedItem>
      ))}
    </Segmented>
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
    <Segmented aria-label={label} width="hug" value={value} onValueChange={onChange}>
      {TIME_INTERVALS.map((key) => (
        <SegmentedItem key={key.query} value={key.query}>
          <span className="capitalize">{key.label}</span>
        </SegmentedItem>
      ))}
    </Segmented>
  );
}

export const BY_RANK_STATS = [...HERO_STATS_WITH_BAN_RATE, "pickrate"] as const;
export type ByRankStat = (typeof BY_RANK_STATS)[number];
