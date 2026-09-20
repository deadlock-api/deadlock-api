import { useQuery } from "@tanstack/react-query";

import { HeroImageFromAsset } from "~/components/domain/assets/HeroImage";
import { HeroSelector } from "~/components/domain/selectors/HeroSelector";
import {
  type HeroMatchupParams,
  type MatchupRow,
  useHeroMatchupRows,
} from "~/components/features/heroes/HeroMatchupDetailsStatsTable";
import { Panel, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Button } from "~/components/ui/button";
import { Heading } from "~/components/ui/heading";
import { DivergingBar } from "~/components/ui/rate-bar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { formatPercent, formatSignedPercent } from "~/lib/format";
import { TONE_TEXT, toneOf } from "~/lib/tone";
import { cn } from "~/lib/utils";
import { heroesQueryOptions, type SlimHero } from "~/queries/asset-queries";

const SMALL_SAMPLE_THRESHOLD = 100;
const number = (value: number) => value.toLocaleString("en-US");
const points = (value: number) => formatSignedPercent(value).replace("%", " pp");

function Impact({ value, scale }: { value: number; scale: number }) {
  return (
    <div className="flex min-w-16 flex-col gap-1">
      <span className={cn("text-end font-semibold tabular-nums", TONE_TEXT[toneOf(value)])}>{points(value)}</span>
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
              <TableHead className="pe-3 text-end" title="Win-rate difference in percentage points">
                Impact
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const hero = heroes.get(row.heroId);
              const delta = row.prevRelWinrate === undefined ? undefined : row.relWinrate - row.prevRelWinrate;
              return (
                <TableRow key={row.heroId}>
                  <TableCell className="ps-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start gap-2 px-2"
                      onClick={() => onSelect(row.heroId)}
                      aria-label={`Explore ${hero?.name ?? "hero"} matchups`}
                    >
                      <HeroImageFromAsset hero={hero} className="size-6 shrink-0" />
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
                  <TableCell
                    className="pe-3"
                    title={
                      delta === undefined ? undefined : `${points(delta)} impact change versus the previous period`
                    }
                  >
                    <Impact value={row.relWinrate} scale={scale} />
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
}: HeroMatchupParams & { onHeroSelected: (heroId: number) => void }) {
  const { data: heroAssets = [] } = useQuery(heroesQueryOptions);
  const { synergyRows, counterRows, heroStats, isLoading, isError, retry } = useHeroMatchupRows(params);
  const heroes = new Map(heroAssets.map((hero) => [hero.id, hero]));
  const heroName = heroes.get(params.heroId)?.name ?? "Your hero";
  const scale = Math.max(
    0.01,
    ...synergyRows.map((row) => Math.abs(row.relWinrate)),
    ...counterRows.map((row) => Math.abs(row.relWinrate)),
  );

  return (
    <div className="flex flex-col gap-3">
      <section aria-label={`${heroName} matchup overview`} className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Heading as="h2" className="sr-only">
          {heroName}’s matchups
        </Heading>
        <HeroSelector
          value={params.heroId}
          label="Hero"
          defaultValue={params.heroId}
          onValueChange={(id) => {
            if (id != null) onHeroSelected(id);
          }}
        />
        {!isLoading && !isError && heroStats?.matches ? (
          <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
            <strong className="text-base font-semibold text-foreground tabular-nums">
              {formatPercent(heroStats.wins / heroStats.matches)}
            </strong>
            win rate <span aria-hidden="true">·</span> {number(heroStats.matches)} matches
          </p>
        ) : null}
      </section>

      {isLoading ? (
        <LoadingState variant="skeleton" label="hero matchups" className="h-80" />
      ) : isError ? (
        <ErrorState
          title="Matchups could not be loaded"
          description="Some matchup data is unavailable. Try loading it again."
          onRetry={() => void retry()}
        />
      ) : (
        <div className="grid items-start gap-3 xl:grid-cols-2">
          <MatchupRanking
            key={`allies-${params.heroId}`}
            title="Allies"
            rows={synergyRows}
            heroes={heroes}
            onSelect={onHeroSelected}
            scale={scale}
          />
          <MatchupRanking
            key={`opponents-${params.heroId}`}
            title="Opponents"
            rows={counterRows}
            heroes={heroes}
            onSelect={onHeroSelected}
            scale={scale}
          />
        </div>
      )}
    </div>
  );
}
