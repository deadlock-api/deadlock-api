import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";

import {
  type HeroMatchupParams,
  type MatchupRow,
  useHeroMatchupRows,
} from "~/components/heroes-page/HeroMatchupDetailsStatsTable";
import { HeroImageFromAsset } from "~/components/HeroImage";
import { HeroSelector } from "~/components/selectors/HeroSelector";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "~/components/ui/empty";
import { Skeleton } from "~/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { formatPercent, formatSignedPercent } from "~/lib/format";
import { cn } from "~/lib/utils";
import { heroesQueryOptions, type SlimHero } from "~/queries/asset-queries";

const SMALL_SAMPLE_THRESHOLD = 100;
const number = (value: number) => value.toLocaleString("en-US");
const points = (value: number) => formatSignedPercent(value).replace("%", " pp");

function Impact({ value, scale }: { value: number; scale: number }) {
  return (
    <div className="flex min-w-16 flex-col gap-1">
      <span className={cn("text-right font-semibold tabular-nums", value < 0 ? "text-primary" : "text-chart-4")}>
        {points(value)}
      </span>
      <div className="relative h-1 w-full rounded-full bg-muted" aria-hidden="true">
        <div className="absolute -top-0.5 left-1/2 h-2 w-px bg-muted-foreground/60" />
        <div
          className={cn("absolute h-full rounded-full", value < 0 ? "bg-primary" : "bg-chart-4")}
          style={{
            width: `${(Math.abs(value) / scale) * 50}%`,
            left: value < 0 ? undefined : "50%",
            right: value < 0 ? "50%" : undefined,
          }}
        />
      </div>
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
    <Card className="min-w-0 gap-2 overflow-hidden py-3">
      <CardHeader className="px-3">
        <CardTitle>
          <h3>{title}</h3>
        </CardTitle>
        <CardDescription className="sr-only">Sorted by highest impact for the selected hero.</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {rows.length ? (
          <Table aria-label={title}>
            <TableHeader>
              <TableRow>
                <TableHead className="h-8 pl-3">Hero</TableHead>
                <TableHead className="hidden h-8 text-right sm:table-cell">Matches</TableHead>
                <TableHead className="h-8 text-right">Win rate</TableHead>
                <TableHead className="h-8 pr-3 text-right" title="Win-rate difference in percentage points">
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
                    <TableCell className="py-1 pl-3">
                      <Button
                        variant="ghost"
                        className="-ml-2 h-8 justify-start gap-2 px-2"
                        onClick={() => onSelect(row.heroId)}
                        aria-label={`Explore ${hero?.name ?? "hero"} matchups`}
                      >
                        <HeroImageFromAsset hero={hero} className="size-6 shrink-0" />
                        <span className="max-w-20 truncate sm:max-w-none">{hero?.name ?? "Unknown hero"}</span>
                      </Button>
                      <div className="text-xs text-muted-foreground sm:hidden">
                        {number(row.matches)} matches{row.matches < SMALL_SAMPLE_THRESHOLD ? " · Small sample" : ""}
                      </div>
                    </TableCell>
                    <TableCell className="hidden py-1 text-right tabular-nums sm:table-cell">
                      <div>{number(row.matches)}</div>
                      {row.matches < SMALL_SAMPLE_THRESHOLD && (
                        <span className="text-xs text-muted-foreground">Small sample</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1 text-right tabular-nums">
                      {formatPercent(row.wins / row.matches)}
                    </TableCell>
                    <TableCell
                      className="py-1 pr-3"
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
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No matchups available</EmptyTitle>
              <EmptyDescription>Try a wider date range, more ranks, or a lower minimum match count.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
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
        <h2 className="sr-only">{heroName}’s matchups</h2>
        <HeroSelector
          selectedHero={params.heroId}
          label=""
          defaultValue={params.heroId}
          onHeroSelected={(id) => {
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
        <div aria-busy="true" aria-label="Loading hero matchups" className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-80 w-full" />
          <output className="sr-only">Loading hero matchups…</output>
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>Matchups could not be loaded</AlertTitle>
          <AlertDescription>
            <p>Some matchup data is unavailable. Try loading it again.</p>
            <Button variant="outline" onClick={() => void retry()}>
              Retry matchups
            </Button>
          </AlertDescription>
        </Alert>
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
