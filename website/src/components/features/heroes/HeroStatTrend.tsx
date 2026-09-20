import { lazy, Suspense, type ComponentProps } from "react";

import { LoadingState } from "~/components/patterns/states/LoadingState";
import { ProgressBarWithLabel } from "~/components/ui/progress-bar";
import { Tooltip, TooltipTarget } from "~/components/ui/tooltip";
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
    <Tooltip
      variant="preview"
      side="bottom"
      align="end"
      content={
        <Suspense fallback={<LoadingState label="trend" className="flex h-62.5 items-center justify-center" />}>
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
        </Suspense>
      }
    >
      <TooltipTarget display="block">
        <span className="sr-only">{`${heroName} ${HERO_TABLE_TRENDS[stat].label} over time`}</span>
        <ProgressBarWithLabel {...progressProps} />
      </TooltipTarget>
    </Tooltip>
  );
}
