import { useId, useMemo } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { soulParts, SOUL_SOURCE_GROUPS, type StatKey } from "~/components/domain/match/soul-sources";
import { ChartLegend, ChartLegendItem, ChartSwatch } from "~/components/patterns/charts/ChartLegend";
import { Card } from "~/components/ui/card";
import { DetailPopover } from "~/components/ui/detail-popover";
import { Heading, useNextHeadingLevel } from "~/components/ui/heading";
import { NoValue } from "~/components/ui/no-value";
import { ProgressBar, ProgressBarSegment } from "~/components/ui/progress-bar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableRowHeader } from "~/components/ui/table";
import { TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { formatOrdinal, formatShare } from "~/lib/format";
import {
  permanentBuffCount,
  permanentBuffsByStat,
  type PlayerSouls,
  type SoulContext,
  soulContexts,
  soulFieldOf,
} from "~/lib/tracker/match-souls";
import { TEAMS } from "~/lib/tracker/teams";
import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

const whole = (value: number) => Math.round(value).toLocaleString("en-US");

interface SourceReading {
  key: string;
  label: string;
  color: string;
  value: number;
  orb: number;
}

/** A player's income in the Games page's soul source groups, in their one order. */
function sourceReadings(souls: PlayerSouls): SourceReading[] {
  const read = (key: StatKey) => {
    const field = soulFieldOf(key);
    return field ? souls[field] : 0;
  };
  return SOUL_SOURCE_GROUPS.map((group) => {
    const { base, orb } = soulParts(read, group);
    return { key: group.key, label: group.label, color: group.color, value: base + orb, orb };
  });
}

const income = (readings: readonly SourceReading[]) => readings.reduce((sum, reading) => sum + reading.value, 0);

function SoulsDetails({
  player,
  name,
  readings,
  context,
}: {
  player: TrackerMatchPlayer;
  name: string;
  readings: SourceReading[];
  context: SoulContext | undefined;
}) {
  const total = income(readings);
  const buffs = permanentBuffsByStat(player.permanent_buffs);
  return (
    <>
      <TooltipHeader
        leading={<HeroImage heroId={player.hero_id} shape="circle" className="size-8 shrink-0" title="" />}
        title={name}
        subtitle={`${whole(total)} souls earned`}
      />
      <TooltipStats>
        {readings.map((reading) =>
          reading.value > 0 ? (
            <TooltipStat
              key={reading.key}
              label={
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <ChartSwatch color={reading.color} size="sm" />
                  {reading.label}
                </span>
              }
              value={
                <>
                  {whole(reading.value)}
                  <span className="text-muted-foreground"> · {formatShare(total > 0 ? reading.value / total : 0)}</span>
                </>
              }
            />
          ) : null,
        )}
        {context && context.urnDelivered > 0 && (
          <>
            <TooltipStat label="Urn delivered" value={whole(context.urnDelivered)} />
            <TooltipStat label="Urn team share" value={whole(context.urnShared)} />
          </>
        )}
        {readings.some((reading) => reading.orb > 0) && (
          <TooltipStat label="From orbs" value={whole(readings.reduce((sum, reading) => sum + reading.orb, 0))} />
        )}
        {player.souls && player.souls.gold_death_loss > 0 && (
          <TooltipStat label="Lost on death" value={whole(player.souls.gold_death_loss)} />
        )}
      </TooltipStats>
      <TooltipStats>
        <TooltipStat
          label="Unspent souls on average"
          value={context?.unspentPerMin != null ? whole(context.unspentPerMin) : <NoValue label="Not recorded" />}
        />
        {context?.unspentRank != null && (
          <TooltipStat label="Most unspent" value={`${formatOrdinal(context.unspentRank)} of ${context.unspentOf}`} />
        )}
        <TooltipStat
          label="Breakables broken"
          value={player.breakables_broken != null ? whole(player.breakables_broken) : <NoValue label="Not recorded" />}
        />
        <TooltipStat label="Statue buffs" value={whole(permanentBuffCount(player.permanent_buffs))} />
        {buffs.map((buff) => (
          <TooltipStat key={buff.stat} label={<span className="ps-3">{buff.stat}</span>} value={`×${buff.count}`} />
        ))}
      </TooltipStats>
    </>
  );
}

/**
 * Where each player's souls came from, in the sources and colors of the Games page's soul economy, beside what they
 * held unspent, the breakables they broke and the statue buffs they picked up. The bars share the lobby's top income as
 * their scale, so their lengths compare across both teams.
 */
export function SoulsCard({
  players,
  durationS,
  trackedAccountId,
  nameOf,
}: {
  players: TrackerMatchPlayer[];
  durationS: number;
  /** The tracked player, whose row stands out; absent when the match is seen on its own. */
  trackedAccountId?: number;
  nameOf: (player: TrackerMatchPlayer) => string;
}) {
  const titleId = useId();
  const headingLevel = useNextHeadingLevel();
  const contexts = useMemo(() => soulContexts(players, durationS), [players, durationS]);
  const rows = useMemo(
    () =>
      players.flatMap((player) => {
        if (!player.souls) return [];
        const readings = sourceReadings(player.souls);
        return [{ player, readings, total: income(readings) }];
      }),
    [players],
  );
  const maxIncome = Math.max(0, ...rows.map((row) => row.total));
  return (
    <Card asChild tone="inset" size="xs" className="px-3">
      <section aria-labelledby={titleId}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <Heading id={titleId} as={headingLevel} size="sm">
            Souls
          </Heading>
          <span className="text-xs text-muted-foreground">Where they came from, and how long they sat unspent</span>
        </div>
        <ChartLegend label="Soul sources" size="sm">
          {SOUL_SOURCE_GROUPS.map((group) => (
            <ChartLegendItem key={group.key} color={group.color}>
              {group.label}
            </ChartLegendItem>
          ))}
        </ChartLegend>
        <div className="grid gap-4 @6xl:grid-cols-2">
          {TEAMS.map((team) => {
            const teamRows = rows.filter((row) => row.player.team === team.key).sort((a, b) => b.total - a.total);
            if (teamRows.length === 0) return null;
            return (
              <div key={team.key} className="flex min-w-0 flex-col gap-1">
                <span className="text-xs font-medium">{team.name}</span>
                <Table aria-label={`${team.name} souls`}>
                  <TableHeader>
                    <TableRow className="text-xs text-muted-foreground">
                      <TableHead className="h-auto py-1 font-normal">Player</TableHead>
                      <TableHead className="h-auto w-full py-1 font-normal">Sources</TableHead>
                      <TableHead className="hidden h-auto px-1.5 py-1 text-end font-normal @sm:table-cell">
                        Earned
                      </TableHead>
                      <TableHead
                        className="h-auto px-1.5 py-1 text-end font-normal"
                        title="Souls held unspent at an average moment of the match"
                      >
                        Avg unspent
                      </TableHead>
                      <TableHead className="hidden h-auto px-1.5 py-1 text-end font-normal @md:table-cell">
                        Breakables
                      </TableHead>
                      <TableHead
                        className="hidden h-auto px-1.5 py-1 text-end font-normal @md:table-cell"
                        title="Permanent buffs picked up from statues"
                      >
                        Statue buffs
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamRows.map(({ player, readings, total }) => {
                      const name = nameOf(player);
                      const context = contexts.get(player.account_id);
                      return (
                        <TableRow
                          key={player.account_id}
                          data-state={player.account_id === trackedAccountId ? "current" : undefined}
                        >
                          <TableRowHeader className="max-w-40 py-1">
                            <DetailPopover
                              label={`${name}'s souls`}
                              size="xs"
                              className="w-full min-w-0 justify-start px-0"
                              details={
                                <SoulsDetails player={player} name={name} readings={readings} context={context} />
                              }
                            >
                              <span className="flex min-w-0 items-center gap-1.5">
                                <HeroImage
                                  heroId={player.hero_id}
                                  shape="circle"
                                  className="size-5 shrink-0"
                                  title=""
                                />
                                <span className="min-w-0 truncate">{name}</span>
                              </span>
                            </DetailPopover>
                          </TableRowHeader>
                          <TableCell className="min-w-24 py-1">
                            <ProgressBar max={maxIncome}>
                              {readings.map((reading) => (
                                <ProgressBarSegment key={reading.key} value={reading.value} color={reading.color} />
                              ))}
                            </ProgressBar>
                            <span className="sr-only">
                              {readings
                                .filter((reading) => reading.value > 0)
                                .map((reading) => `${reading.label} ${whole(reading.value)}`)
                                .join(", ")}
                            </span>
                          </TableCell>
                          <TableCell className="hidden px-1.5 py-1 text-end tabular-nums @sm:table-cell">
                            {whole(total)}
                          </TableCell>
                          <TableCell className="px-1.5 py-1 text-end whitespace-nowrap tabular-nums">
                            {context?.unspentPerMin != null ? (
                              <>
                                {whole(context.unspentPerMin)}
                                {context.unspentRank != null && (
                                  <span className="text-muted-foreground">
                                    {" "}
                                    · {formatOrdinal(context.unspentRank)}
                                    <span className="sr-only"> most of {context.unspentOf}</span>
                                  </span>
                                )}
                              </>
                            ) : (
                              <NoValue label="Not recorded" />
                            )}
                          </TableCell>
                          <TableCell className="hidden px-1.5 py-1 text-end tabular-nums @md:table-cell">
                            {player.breakables_broken != null ? (
                              whole(player.breakables_broken)
                            ) : (
                              <NoValue label="Not recorded" />
                            )}
                          </TableCell>
                          <TableCell className="hidden px-1.5 py-1 text-end tabular-nums @md:table-cell">
                            {whole(permanentBuffCount(player.permanent_buffs))}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            );
          })}
        </div>
      </section>
    </Card>
  );
}
