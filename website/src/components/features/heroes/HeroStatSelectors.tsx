import { MetricSelect } from "~/components/patterns/charts/MetricSelect";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { SelectGroup, SelectItem, SelectLabel } from "~/components/ui/select";
import { HERO_TREND_LABELS } from "~/lib/hero-trends";
import { HERO_STATS, TIME_INTERVALS } from "~/types/api_hero_stats";

function metricLabel(key: string) {
  return (
    (key === "pickrate" ? "Pick rate" : HERO_TREND_LABELS[key as keyof typeof HERO_TREND_LABELS]) ??
    key.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase())
  );
}

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
      <MetricSelect value={value} valueLabel={metricLabel(value)} onValueChange={onChange} label={label}>
        <SelectGroup>
          <SelectLabel>Hero metrics</SelectLabel>
          {items.map((key) => (
            <SelectItem key={key} value={key}>
              {metricLabel(key)}
            </SelectItem>
          ))}
        </SelectGroup>
      </MetricSelect>
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
