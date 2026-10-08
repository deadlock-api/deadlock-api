import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { RankedEntityList, RankedEntityMetric, RankedEntityRow } from "~/components/domain/assets/RankedEntityList";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { Button } from "~/components/ui/button";
import { formatPercent } from "~/lib/format";
import type { PatchNotes as Notes } from "~/lib/patch-notes";
import type { PatchReport } from "~/lib/patch-report-fns";
import { PATCH_MIN_BADGE, type PatchEntry, patchDate, patchDateRange, patchLabel } from "~/lib/patches";
import { MAX_BADGE } from "~/lib/rank-utils";
import { cn } from "~/lib/utils";

import { PatchStatChanges } from "./PatchGameStats";
import { PatchMoverPanel } from "./PatchMovers";
import { PatchNotes } from "./PatchNotes";
import { PatchRankSplit } from "./PatchRankSplit";

type Filters = { date_range: string; min_rank: number; max_rank: number };

/** A panel's way into the full analytics view. */
function ViewAll({
  to,
  search,
  label,
}: {
  to: "/analytics/heroes" | "/analytics/items" | "/analytics/games";
  search: Filters;
  label: string;
}) {
  return (
    <Button asChild variant="ghost" size="xs">
      <Link to={to} search={search} preload="intent">
        <ViewAllLabel>{label}</ViewAllLabel>
      </Link>
    </Button>
  );
}

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
  notes,
  hasData,
  days,
}: {
  patch: PatchEntry;
  /** Undefined when the stats failed to load. */
  report: PatchReport | undefined;
  /** The announcement or changelog, when the feed has a post for the patch's day. */
  notes?: Notes;
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

  const ready = !!report && hasData;
  // The statistics need the report; the notes are shown without it.
  const statChanges = ready && stats;
  const movers = ready && (heroes || items) ? report : undefined;

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
        <>
          {notes && <PatchNotes notes={notes} layout="fit" />}
          <ErrorState title={`${label} stats did not load`} />
        </>
      ) : !hasData ? (
        <>
          {notes && <PatchNotes notes={notes} layout="fit" />}
          <EmptyState title={`Not enough matches since the ${label} yet`} />
        </>
      ) : (
        <>
          {!heroes && !newHeroes && !items && !ranks && !stats && (
            <EmptyState title={`No significant changes since the ${label}`} />
          )}

          {/* The notes beside the game stats that changed, the same height; then what moved most, four across. */}
          {(notes || statChanges) && (
            <div className="@container">
              <div className={cn("grid items-stretch gap-6", notes && statChanges && "@5xl:grid-cols-2")}>
                {notes && <PatchNotes notes={notes} layout={statChanges ? "fill" : "fit"} />}
                {statChanges && (
                  <Panel>
                    <PanelHeader title="Game Stat Changes" size="sm">
                      <ViewAll to="/analytics/games" search={filters} label="All game stats" />
                    </PanelHeader>
                    <PanelBody>
                      <PatchStatChanges changes={report.statChanges} />
                    </PanelBody>
                  </Panel>
                )}
              </div>
            </div>
          )}

          {/* Every panel of what moved in one grid, two across, so a list on its own sits beside the next panel. */}
          {(movers || newHeroes || ranks) && (
            <div className="@container">
              <div className="grid items-stretch gap-6 @3xl:grid-cols-2">
                {movers && heroes && (
                  <PatchMoverPanel
                    title="Hero Win Rate Changes"
                    gains={movers.heroMovers.gains}
                    drops={movers.heroMovers.drops}
                    metric="winRate"
                    action={<ViewAll to="/analytics/heroes" search={filters} label="All heroes" />}
                  />
                )}
                {movers && items && (
                  <PatchMoverPanel
                    title="Item Build Changes"
                    gains={movers.itemMovers.gains}
                    drops={movers.itemMovers.drops}
                    metric="pickRate"
                    action={<ViewAll to="/analytics/items" search={filters} label="All items" />}
                  />
                )}

                {newHeroes && (
                  <Panel>
                    <PanelHeader title="New Heroes" size="sm" />
                    <PanelBody>
                      <RankedEntityList density="compact" columns="single">
                        {report.newHeroes.map((hero, index) => (
                          <RankedEntityRow
                            key={hero.id}
                            rank={index + 1}
                            entity={{ heroId: hero.id }}
                            meta={`${hero.matches.toLocaleString("en-US")} matches`}
                          >
                            <RankedEntityMetric label="Win rate" className="w-16" value={formatPercent(hero.winRate)} />
                            <RankedEntityMetric
                              label="Pick rate"
                              className="w-16"
                              value={formatPercent(hero.pickRate)}
                            />
                          </RankedEntityRow>
                        ))}
                      </RankedEntityList>
                    </PanelBody>
                  </Panel>
                )}

                {ranks && (
                  <Panel>
                    <PanelHeader title="Low vs High Ranks" size="sm">
                      <Button asChild variant="ghost" size="xs">
                        <Link
                          to="/analytics/heroes/by-rank"
                          search={{ date_range: filters.date_range }}
                          preload="intent"
                        >
                          <ViewAllLabel>Heroes by rank</ViewAllLabel>
                        </Link>
                      </Button>
                    </PanelHeader>
                    <PanelBody>
                      <PatchRankSplit rows={report.rankGaps} />
                    </PanelBody>
                  </Panel>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
