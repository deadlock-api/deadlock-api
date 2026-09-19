import type React from "react";
import { useMemo } from "react";

import { MetricSelect } from "~/components/analytics/MetricSelect";

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
    <section
      aria-label="Metric controls"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2"
    >
      <span className="text-sm font-semibold">Game metrics</span>
      <MetricSelect
        value={value}
        onChange={onChange}
        label="Game metric"
        groups={categories.map((category) => ({
          label: category.label,
          options: category.stats.map((stat) => ({ value: stat.key, label: stat.label })),
        }))}
      />
      {children}
    </section>
  );
}
