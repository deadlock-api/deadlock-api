import { ChartNoAxesCombined } from "lucide-react";
import type React from "react";
import { useMemo } from "react";

import { MetricSelect } from "~/components/patterns/charts/MetricSelect";
import { FilterBar } from "~/components/patterns/filter-bar/FilterBar";
import { SelectGroup, SelectItem, SelectLabel } from "~/components/ui/select";

import { getFilteredCategories, getStatDefinition } from "./stat-definitions";

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
  const categories = useMemo(() => getFilteredCategories(isStreetBrawl), [isStreetBrawl]);
  return (
    <FilterBar variant="toolbar" title="Game metrics" icon={ChartNoAxesCombined} aria-label="Metric controls">
      <MetricSelect
        value={value}
        valueLabel={getStatDefinition(value)?.label}
        onValueChange={onChange}
        label="Game metric"
      >
        {categories.map((category) => (
          <SelectGroup key={category.label}>
            <SelectLabel>{category.label}</SelectLabel>
            {category.stats.map((stat) => (
              <SelectItem key={stat.key} value={stat.key}>
                {stat.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </MetricSelect>
      {children}
    </FilterBar>
  );
}
