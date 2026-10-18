import { ChartNoAxesCombined } from "lucide-react";
import type React from "react";

import { MetricSelect } from "~/components/patterns/charts/MetricSelect";
import { FilterBar } from "~/components/patterns/filter-bar/FilterBar";
import { Field } from "~/components/ui/field";
import { SelectGroup, SelectItem, SelectLabel } from "~/components/ui/select";
import { getFilteredCategories, getStatDefinition } from "~/lib/game-stat-definitions";

/** The one picker of the `stat` URL parameter, on every tab that plots a game stat; `children` add more controls. */
export function StatSelector({
  value,
  onChange,
  children,
  isStreetBrawl = false,
}: {
  value: string;
  onChange: (val: string) => void;
  children?: React.ReactNode;
  isStreetBrawl?: boolean;
}) {
  return (
    <FilterBar variant="toolbar" title="Game metrics" icon={ChartNoAxesCombined} aria-label="Metric controls">
      <Field label="Metric" orientation="horizontal" className="w-full @sm:w-auto">
        <MetricSelect
          value={value}
          valueLabel={getStatDefinition(value)?.label}
          onValueChange={onChange}
          label="Game metric"
        >
          <GameMetricOptions isStreetBrawl={isStreetBrawl} />
        </MetricSelect>
      </Field>
      {children}
    </FilterBar>
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
