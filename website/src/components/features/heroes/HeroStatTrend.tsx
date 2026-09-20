import { lazy, type ComponentProps } from "react";

import { StatTrendHoverCard } from "~/components/patterns/charts/StatTrendHoverCard";
import { ProgressBarWithLabel } from "~/components/ui/progress-bar";
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
      triggerDisplay="block"
      trigger={
        <>
          <span className="sr-only">{`${heroName} ${HERO_TABLE_TRENDS[stat].label} over time`}</span>
          <ProgressBarWithLabel {...progressProps} />
        </>
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
