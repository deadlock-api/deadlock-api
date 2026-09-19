import { lazy, type ComponentProps } from "react";

import { StatTrendHoverCard } from "~/components/analytics/StatTrendHoverCard";
import { ProgressBarWithLabel } from "~/components/primitives/ProgressBar";
import { HERO_TABLE_TRENDS } from "~/lib/hero-table-trends";

import type { HeroStatTrendChartProps } from "./HeroStatTrendChart";

const HeroStatTrendChart = lazy(() => import("./HeroStatTrendChart"));

export function HeroStatTrend({
  params,
  heroId,
  heroName,
  stat,
  bucket,
  onBucketChange,
  ...progressProps
}: HeroStatTrendChartProps & Omit<ComponentProps<typeof ProgressBarWithLabel>, "tooltip"> & { heroName: string }) {
  return (
    <StatTrendHoverCard
      trigger={
        <button
          type="button"
          className="w-full cursor-default rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
          aria-label={`${heroName} ${HERO_TABLE_TRENDS[stat].label} over time`}
        >
          <ProgressBarWithLabel {...progressProps} />
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold">{heroName}</p>
        <HeroStatTrendChart
          params={params}
          heroId={heroId}
          stat={stat}
          bucket={bucket}
          onBucketChange={onBucketChange}
        />
      </div>
    </StatTrendHoverCard>
  );
}
