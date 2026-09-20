import type React from "react";
import { useMemo } from "react";

import { ChartToolbar } from "~/components/patterns/charts/ChartToolbar";
import { MetricSelect } from "~/components/patterns/charts/MetricSelect";

import { getFilteredCategories } from "./stat-definitions";

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
    <ChartToolbar title="Game metrics" label="Metric controls">
      <MetricSelect
        value={value}
        onValueChange={onChange}
        label="Game metric"
        groups={categories.map((category) => ({
          label: category.label,
          options: category.stats.map((stat) => ({ value: stat.key, label: stat.label })),
        }))}
      />
      {children}
    </ChartToolbar>
  );
}
