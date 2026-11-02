import { use } from "react";

import { MetricSelect } from "~/components/patterns/charts/MetricSelect";
import { FilterRootContext, FilterToggleCell } from "~/components/patterns/filter-bar/FilterCell";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { SelectGroup, SelectItem, SelectLabel } from "~/components/ui/select";
import { HERO_TREND_LABELS } from "~/lib/hero-trends";
import { HERO_STATS } from "~/types/api_hero_stats";

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
  /** The control's name: shown in its chip in a filter row, the accessible name elsewhere. */
  label?: string;
}) {
  const items = options ?? HERO_STATS;
  const inRoot = use(FilterRootContext);
  if (inRoot && items.length <= 7) {
    return (
      <FilterToggleCell label={label ?? "Metric"} value={value} onValueChange={onChange}>
        {items.map((key: T[number]) => (
          <SegmentedItem key={key} value={key}>
            {metricLabel(key)}
          </SegmentedItem>
        ))}
      </FilterToggleCell>
    );
  }
  if (items.length > 7 || inRoot) {
    return (
      <MetricSelect value={value} valueLabel={metricLabel(value)} onValueChange={onChange} label={label ?? "Metric"}>
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
