import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import {
  type HeroMatchupParams,
  type MatchupRow,
  useHeroMatchupRows,
} from "~/components/features/heroes/HeroMatchupDetailsStatsTable";
import { Panel, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { StaleOverlay } from "~/components/patterns/states/StaleOverlay";
import { Button } from "~/components/ui/button";
import { Delta } from "~/components/ui/delta";
import { DivergingBar } from "~/components/ui/rate-bar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { findKey } from "~/lib/find-keys";
import { formatPercent, formatSignedPercent } from "~/lib/format";
import { TONE_TEXT, toneOf } from "~/lib/tone";
import { cn } from "~/lib/utils";
import { heroesQueryOptions, type SlimHero } from "~/queries/asset-queries";

const SMALL_SAMPLE_THRESHOLD = 100;
const number = (value: number) => value.toLocaleString("en-US");
const points = (value: number) => formatSignedPercent(value).replace("%", " pp");

/** The impact, its change versus the previous period on the same line, and the bar under both. */
function Impact({ value, delta, scale }: { value: number; delta?: number; scale: number }) {
  return (
    <div className="flex min-w-16 flex-col gap-1">
      <span className="flex items-baseline justify-end gap-1.5">
        <span className={cn("font-semibold tabular-nums", TONE_TEXT[toneOf(value)])}>{points(value)}</span>
        {delta !== undefined && (
          <>
            <span className="sr-only">change versus the previous period</span>
            <Delta value={delta} unit=" pp" className="text-xs" />
          </>
        )}
      </span>
      <DivergingBar value={value} scale={scale} className="h-1 w-full" />
    </div>
  );
}

function MatchupRanking({
  title,
  rows,
  heroes,
  onSelect,
  scale,
}: {
  title: string;
  rows: MatchupRow[];
  heroes: Map<number, SlimHero>;
  onSelect: (heroId: number) => void;
  scale: number;
}) {
  return (
    <Panel>
      <PanelHeader title={title} />
      <p className="sr-only">Sorted by highest impact for the selected hero.</p>
      {rows.length ? (
        <Table aria-label={title} density="compact">
          <TableHeader>
            <TableRow>
              <TableHead className="ps-3">Hero</TableHead>
              <TableHead className="hidden text-end sm:table-cell">Matches</TableHead>
              <TableHead className="text-end">Win rate</TableHead>
              <TableHead className="pe-3 text-end">Impact</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const hero = heroes.get(row.heroId);
              const delta = row.prevRelWinrate === undefined ? undefined : row.relWinrate - row.prevRelWinrate;
              return (
                <TableRow key={row.heroId} data-find={findKey.hero(row.heroId)}>
                  <TableCell className="ps-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start gap-2 px-2"
                      onClick={() => onSelect(row.heroId)}
                      aria-label={`Explore ${hero?.name ?? "hero"} matchups`}
                    >
                      <HeroImage hero={hero} decorative className="size-6 shrink-0" />
                      <span className="max-w-20 truncate sm:max-w-none">{hero?.name ?? "Unknown hero"}</span>
                    </Button>
                    <div className="ps-2 text-xs text-muted-foreground sm:hidden">
                      {number(row.matches)} matches{row.matches < SMALL_SAMPLE_THRESHOLD ? " · Small sample" : ""}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-end tabular-nums sm:table-cell">
                    <div>{number(row.matches)}</div>
                    {row.matches < SMALL_SAMPLE_THRESHOLD && (
                      <span className="text-xs text-muted-foreground">Small sample</span>
                    )}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{formatPercent(row.wins / row.matches)}</TableCell>
                  <TableCell className="pe-3">
                    <Impact value={row.relWinrate} delta={delta} scale={scale} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <EmptyState
          variant="plain"
          title="No matchups available"
          description="Try a wider date range, more ranks, or a lower minimum match count."
        />
      )}
    </Panel>
  );
}

export function HeroMatchupExplorer({
  onHeroSelected,
  ...params
}: HeroMatchupParams & {
  onHeroSelected: (heroId: number) => void;
}) {
  const { data: heroAssets = [] } = useQuery(heroesQueryOptions);
  const { synergyRows, counterRows, heroStats, isLoading, isStale, isError, retry } = useHeroMatchupRows(params);
  const heroes = new Map(heroAssets.map((hero) => [hero.id, hero]));
  const heroName = heroes.get(params.heroId)?.name ?? "Your hero";
  // An edited or stale ?hero_id= matched no hero and read as "no matchups for these filters".
  const unknownHero = heroAssets.length > 0 && !heroes.has(params.heroId);
  // Picking a hero from a ranking replaces the tables (and the pressed button) while the new hero loads: focus moves to
  // the overview, which names the new hero, instead of falling back to the page body.
  const overviewRef = useRef<HTMLParagraphElement>(null);
  const selectFromRanking = (heroId: number) => {
    onHeroSelected(heroId);
    overviewRef.current?.focus();
  };
  const scale = Math.max(
    0.01,
    ...synergyRows.map((row) => Math.abs(row.relWinrate)),
    ...counterRows.map((row) => Math.abs(row.relWinrate)),
  );

  return (
    <div className="flex flex-col gap-3">
      {/* The hero and lane are chosen in the page's filter row; this line sums up the hero's own record. Focus lands
          here after a pick from a ranking, so a screen reader hears the new hero. */}
      <p
        ref={overviewRef}
        tabIndex={-1}
        aria-live="polite"
        className="flex min-h-6 flex-wrap items-baseline gap-x-2 text-sm text-muted-foreground"
      >
        <span className="font-semibold text-foreground">{heroName}</span>
        {!isLoading && !isError && heroStats?.matches ? (
          <>
            <strong className="text-base font-semibold text-foreground tabular-nums">
              {formatPercent(heroStats.wins / heroStats.matches)}
            </strong>
            win rate <span aria-hidden="true">·</span> {number(heroStats.matches)} matches
          </>
        ) : null}
      </p>

      {unknownHero ? (
        <EmptyState
          title="No hero with this ID"
          description="The link names a hero that does not exist. Pick a hero above to see their matchups."
        />
      ) : isLoading ? (
        <LoadingState variant="skeleton" label="hero matchups" className="h-80" />
      ) : isError ? (
        <ErrorState
          title="Matchups could not be loaded"
          description="Some matchup data is unavailable. Try loading it again."
          onRetry={() => void retry()}
        />
      ) : (
        <StaleOverlay active={isStale} label="hero matchups" className="grid gap-3 xl:grid-cols-2">
          <MatchupRanking
            title="Allies"
            rows={synergyRows}
            heroes={heroes}
            onSelect={selectFromRanking}
            scale={scale}
          />
          <MatchupRanking
            title="Opponents"
            rows={counterRows}
            heroes={heroes}
            onSelect={selectFromRanking}
            scale={scale}
          />
        </StaleOverlay>
      )}
    </div>
  );
}
