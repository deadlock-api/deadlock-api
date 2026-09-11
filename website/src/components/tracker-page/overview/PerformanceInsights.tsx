import { ArrowDownRight, ArrowUpRight, Lightbulb } from "lucide-react";

import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { Button } from "~/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "~/components/ui/empty";
import { type Insight, MIN_DELTA_POINTS, MIN_HERO_MATCHES, MIN_SPLIT_MATCHES } from "~/lib/tracker/insights";
import { cn } from "~/lib/utils";

import { DashboardPanel } from "./DashboardPanel";

export function PerformanceInsights({
  insights,
  baseline,
  resultFiltered,
  onSelectHero,
}: {
  insights: Insight[];
  baseline: number;
  resultFiltered: boolean;
  onSelectHero: (heroId: number) => void;
}) {
  return (
    <DashboardPanel
      title="Performance insights"
      icon={Lightbulb}
      meta={resultFiltered ? "Win-rate comparisons paused" : `${(baseline * 100).toFixed(1)}% overall win rate`}
    >
      {resultFiltered || insights.length === 0 ? (
        <Empty className="p-3 md:p-3">
          <EmptyHeader className="max-w-lg">
            <EmptyTitle>{resultFiltered ? "Include wins and losses" : "No standout patterns yet"}</EmptyTitle>
            <EmptyDescription>
              {resultFiltered
                ? "Set the result filter to All to compare win rates across your selected matches."
                : `Patterns appear with at least ${MIN_HERO_MATCHES} matches on a hero or ${MIN_SPLIT_MATCHES} in another group, and a ${MIN_DELTA_POINTS}-point gap from your overall win rate.`}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-2">
            {insights.map((insight) => {
              const TrendIcon = insight.tone === "good" ? ArrowUpRight : ArrowDownRight;
              const heroId = insight.heroId;
              return (
                <li key={insight.id} className="flex min-w-0 flex-col gap-2 rounded-md border border-border/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xl font-semibold tabular-nums">{insight.value}</span>
                    <span
                      className={cn(
                        "flex items-center gap-1 text-xs font-medium tabular-nums",
                        insight.tone === "good" ? "text-victory" : "text-primary",
                      )}
                    >
                      <TrendIcon className="size-3.5" aria-hidden="true" />
                      <span aria-hidden="true">{insight.delta} pp</span>
                      <span className="sr-only">{insight.delta} percentage points compared with overall win rate</span>
                    </span>
                  </div>
                  <p className="text-xs font-medium">{insight.headline}</p>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground tabular-nums">{insight.detail}</span>
                    {heroId != null && (
                      <Button variant="ghost" size="xs" onClick={() => onSelectHero(heroId)}>
                        <span className="sr-only">Filter matches to </span>
                        <span aria-hidden="true">
                          <HeroImage heroId={heroId} className="size-4" />
                        </span>
                        <HeroName heroId={heroId} className="max-w-28" />
                        <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="pt-2 text-[10px] leading-relaxed text-muted-foreground">
            Compared with all selected matches. pp = percentage points. At least {MIN_HERO_MATCHES} hero matches or{" "}
            {MIN_SPLIT_MATCHES} matches per group; gaps of {MIN_DELTA_POINTS}+ points. Historical patterns, not
            predictions.
          </p>
        </>
      )}
    </DashboardPanel>
  );
}
