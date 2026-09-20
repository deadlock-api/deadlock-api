import { ArrowDownRight, ArrowUpRight, Lightbulb } from "lucide-react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { TONE_TEXT } from "~/lib/tone";
import { type Insight, MIN_DELTA_POINTS, MIN_HERO_MATCHES, MIN_SPLIT_MATCHES } from "~/lib/tracker/insights";
import { cn } from "~/lib/utils";

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
    <Panel>
      <PanelHeader
        title="Performance insights"
        description={
          resultFiltered ? "Win-rate comparisons paused" : `${(baseline * 100).toFixed(1)}% overall win rate`
        }
        icon={Lightbulb}
        size="sm"
      />
      <PanelBody size="sm">
        {resultFiltered || insights.length === 0 ? (
          <EmptyState
            variant="plain"
            className="p-3 md:p-3"
            title={resultFiltered ? "Include wins and losses" : "No standout patterns yet"}
            description={
              resultFiltered
                ? "Set the result filter to All to compare win rates across your selected matches."
                : `Patterns appear with at least ${MIN_HERO_MATCHES} matches on a hero or ${MIN_SPLIT_MATCHES} in another group, and a ${MIN_DELTA_POINTS}-point gap from your overall win rate.`
            }
          />
        ) : (
          <>
            <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-2">
              {insights.map((insight) => {
                const TrendIcon = insight.tone === "good" ? ArrowUpRight : ArrowDownRight;
                const heroId = insight.heroId;
                return (
                  <Card key={insight.id} asChild tone="outline" size="xs" radius="md" className="p-3">
                    <li>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xl font-semibold tabular-nums">{insight.value}</span>
                        <span
                          className={cn(
                            "flex items-center gap-1 text-xs font-medium tabular-nums",
                            TONE_TEXT[insight.tone === "good" ? "positive" : "negative"],
                          )}
                        >
                          <TrendIcon className="size-3.5" aria-hidden="true" />
                          <span aria-hidden="true">{insight.delta} pp</span>
                          <span className="sr-only">
                            {insight.delta} percentage points compared with overall win rate
                          </span>
                        </span>
                      </div>
                      <p className="text-xs font-medium">{insight.headline}</p>
                      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                        <span className="text-2xs text-muted-foreground tabular-nums">{insight.detail}</span>
                        {heroId != null && (
                          <Button variant="ghost" size="xs" onClick={() => onSelectHero(heroId)}>
                            <span className="sr-only">Filter matches to </span>
                            <span aria-hidden="true">
                              <HeroImage heroId={heroId} className="size-4" title="" />
                            </span>
                            <HeroName heroId={heroId} className="max-w-28" />
                            <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </li>
                  </Card>
                );
              })}
            </ul>
            <p className="pt-2 text-3xs leading-relaxed text-muted-foreground">
              Compared with all selected matches. pp = percentage points. At least {MIN_HERO_MATCHES} hero matches or{" "}
              {MIN_SPLIT_MATCHES} matches per group; gaps of {MIN_DELTA_POINTS}+ points. Historical patterns, not
              predictions.
            </p>
          </>
        )}
      </PanelBody>
    </Panel>
  );
}
