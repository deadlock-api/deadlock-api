import { Activity, Coins, Flame, Swords, Wheat, type LucideIcon } from "lucide-react";
import type React from "react";
import { useMemo } from "react";
import { cn } from "~/lib/utils";
import { getFilteredCategories } from "./stat-definitions";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "Match Flow": Activity,
  Combat: Swords,
  Damage: Flame,
  Farming: Wheat,
  Economy: Coins,
};

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
  const activeCategory = useMemo(() => {
    return categories.find((c) => c.stats.some((s) => s.key === value)) ?? categories[0];
  }, [value, categories]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap justify-center gap-1.5">
        {categories.map((category) => {
          const Icon = CATEGORY_ICONS[category.label];
          const isActive = category.label === activeCategory.label;
          return (
            <button
              key={category.label}
              type="button"
              onClick={() => onChange(category.stats[0].key)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer",
                isActive
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-white/[0.04] text-muted-foreground border border-white/[0.06] hover:bg-white/[0.08]",
              )}
            >
              {Icon && <Icon className="size-3.5" />}
              {category.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {activeCategory.stats.map((stat) => {
          const isActive = stat.key === value;
          return (
            <button
              key={stat.key}
              type="button"
              onClick={() => onChange(stat.key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-white/[0.04] text-muted-foreground border border-white/[0.06] hover:bg-white/[0.08]",
              )}
            >
              {stat.label}
            </button>
          );
        })}
      </div>
      {children}
    </div>
  );
}
