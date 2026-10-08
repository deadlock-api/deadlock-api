import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { RankedEntityList, RankedEntityMetric, RankedEntityRow } from "~/components/domain/assets/RankedEntityList";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { Section } from "~/components/patterns/page/Section";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { Button } from "~/components/ui/button";
import { formatPercent } from "~/lib/format";
import type { PatchReport } from "~/lib/patch-report-fns";
import { PATCH_MIN_BADGE, type PatchEntry, patchDate, patchDateRange, patchLabel } from "~/lib/patches";
import { MAX_BADGE } from "~/lib/rank-utils";
import { cn } from "~/lib/utils";

import { PatchHeadline, PatchStatChanges } from "./PatchGameStats";
import { PatchMoverPanel } from "./PatchMovers";
import { PatchRankSplit } from "./PatchRankSplit";

/** A section's way into the full analytics view. */
function ViewAllLabel({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ArrowRight aria-hidden="true" />
    </>
  );
}

/**
 * What one patch changed beyond the noise: heroes, items, ranks and match stats, before it against after it. A list
 * with nothing significant is left out, and a section with nothing at all.
 */
export function PatchPage({
  patch,
  report,
  hasData,
  days,
}: {
  patch: PatchEntry;
  /** Undefined when the stats failed to load. */
  report: PatchReport | undefined;
  /** Whether the window after the patch has enough matches to compare. */
  hasData: boolean;
  /** Days of data on each side of the patch. */
  days: { before: number; after: number };
}) {
  const label = patchLabel(patch);
  const beforeDays = Math.round(days.before);
  const afterDays = Math.floor(days.after);
  // What the analytics pages need to show this patch: its exact range and the ranks these numbers cover.
  const filters = { date_range: patchDateRange(patch), min_rank: PATCH_MIN_BADGE, max_rank: MAX_BADGE };

  const heroes = report && (report.heroMovers.gains.length > 0 || report.heroMovers.drops.length > 0);
  const newHeroes = report && report.newHeroes.length > 0;
  const items = report && (report.itemMovers.gains.length > 0 || report.itemMovers.drops.length > 0);
  const ranks = report && report.rankGaps.length > 0;
  const stats = report && report.statChanges.length > 0;
  // A side with nothing significant is left out, and the other takes the whole width.
  const bothHeroSides = report && report.heroMovers.gains.length > 0 && report.heroMovers.drops.length > 0;
  const bothItemSides = report && report.itemMovers.gains.length > 0 && report.itemMovers.drops.length > 0;

  return (
    <>
      <PageHeader
        align="start"
        title={`${label}: What Changed`}
        eyebrow={
          <span className="tabular-nums">
            {patchDate(patch)} · Phantom+ · {beforeDays} {beforeDays === 1 ? "day" : "days"} before vs {afterDays}{" "}
            {afterDays === 1 ? "day" : "days"} after
          </span>
        }
      />

      {!report ? (
        <ErrorState title={`${label} stats did not load`} />
      ) : !hasData ? (
        <EmptyState title={`Not enough matches since the ${label} yet`} />
      ) : (
        <>
          <PatchHeadline headline={report.headline} />

          {!heroes && !newHeroes && !items && !ranks && !stats && (
            <EmptyState title={`No significant changes since the ${label}`} />
          )}

          {/* Two sections side by side on a wide page; each lays its own panels out by the room it gets. */}
          <div className="@container grid items-start gap-6 @7xl:grid-cols-2">
            {(heroes || newHeroes) && (
              <Section
                className="@container"
                title="Hero Win Rate Changes"
                action={
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/analytics/heroes" search={filters} preload="intent">
                      <ViewAllLabel>All heroes</ViewAllLabel>
                    </Link>
                  </Button>
                }
              >
                {heroes && (
                  <div className={cn("grid items-stretch gap-4", bothHeroSides && "@2xl:grid-cols-2")}>
                    {report.heroMovers.gains.length > 0 && (
                      <PatchMoverPanel title="Biggest Gains" movers={report.heroMovers.gains} metric="winRate" />
                    )}
                    {report.heroMovers.drops.length > 0 && (
                      <PatchMoverPanel title="Biggest Drops" movers={report.heroMovers.drops} metric="winRate" />
                    )}
                  </div>
                )}
                {newHeroes && (
                  <Panel>
                    <PanelHeader title="New Heroes" size="sm" />
                    <PanelBody>
                      <RankedEntityList density="compact">
                        {report.newHeroes.map((hero, index) => (
                          <RankedEntityRow
                            key={hero.id}
                            rank={index + 1}
                            entity={{ heroId: hero.id }}
                            meta={`${hero.matches.toLocaleString("en-US")} matches`}
                          >
                            <RankedEntityMetric
                              label="Win rate"
                              labelDisplay={index === 0 ? "visible" : "hidden"}
                              value={formatPercent(hero.winRate)}
                            />
                            <RankedEntityMetric
                              label="Pick rate"
                              labelDisplay={index === 0 ? "visible" : "hidden"}
                              value={formatPercent(hero.pickRate)}
                            />
                          </RankedEntityRow>
                        ))}
                      </RankedEntityList>
                    </PanelBody>
                  </Panel>
                )}
              </Section>
            )}

            {items && (
              <Section
                className="@container"
                title="Item Build Changes"
                action={
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/analytics/items" search={filters} preload="intent">
                      <ViewAllLabel>All items</ViewAllLabel>
                    </Link>
                  </Button>
                }
              >
                <div className={cn("grid items-stretch gap-4", bothItemSides && "@2xl:grid-cols-2")}>
                  {report.itemMovers.gains.length > 0 && (
                    <PatchMoverPanel title="Bought More" movers={report.itemMovers.gains} metric="pickRate" />
                  )}
                  {report.itemMovers.drops.length > 0 && (
                    <PatchMoverPanel title="Bought Less" movers={report.itemMovers.drops} metric="pickRate" />
                  )}
                </div>
              </Section>
            )}

            {ranks && (
              <Section
                title="Low vs High Ranks"
                action={
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/analytics/heroes/by-rank" search={{ date_range: filters.date_range }} preload="intent">
                      <ViewAllLabel>Heroes by rank</ViewAllLabel>
                    </Link>
                  </Button>
                }
              >
                <Panel>
                  <PanelBody>
                    <PatchRankSplit rows={report.rankGaps} />
                  </PanelBody>
                </Panel>
              </Section>
            )}

            {stats && (
              <Section
                title="Game Stat Changes"
                action={
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/analytics/games" search={filters} preload="intent">
                      <ViewAllLabel>All game stats</ViewAllLabel>
                    </Link>
                  </Button>
                }
              >
                <Panel>
                  <PanelBody>
                    <PatchStatChanges changes={report.statChanges} />
                  </PanelBody>
                </Panel>
              </Section>
            )}
          </div>
        </>
      )}
    </>
  );
}
