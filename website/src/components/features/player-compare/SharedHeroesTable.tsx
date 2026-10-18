import { Link } from "@tanstack/react-router";
import type { HeroStats } from "deadlock_api_client";
import { UsersRound } from "lucide-react";
import { useState } from "react";

import { HeroCell } from "~/components/domain/assets/HeroCell";
import { Panel, PanelHeader, PanelShowMore } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { SkeletonRows } from "~/components/patterns/states/Skeletons";
import { NoValue } from "~/components/ui/no-value";
import { Skeleton } from "~/components/ui/skeleton";
import { Inline, Stack } from "~/components/ui/stack";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableRowHeader } from "~/components/ui/table";
import { Text } from "~/components/ui/text";
import { TextLink } from "~/components/ui/text-link";
import { Tooltip, TooltipHeader, TooltipStat, TooltipStats, TooltipTarget } from "~/components/ui/tooltip";
import { formatPercent, formatRelativeTime } from "~/lib/format";
import { type GameMode, hasSoulEconomy } from "~/lib/game-mode";
import { sharedHeroes } from "~/lib/player-compare";
import { formatStatValue } from "~/lib/stat-format";
import { toneOf } from "~/lib/tone";

import { PlayerColumnHead } from "./CompareTableParts";
import type { ComparedPlayer } from "./types";

const COLLAPSED_ROWS = 6;

/** "9.1 / 4.0 / 12.3", or null when any of the three is missing. */
function kdaText(values: (number | null | undefined)[]): string | null {
  const parts = values.map((value) => formatStatValue(value, "decimal1"));
  return parts.every((part) => part != null) ? parts.join(" / ") : null;
}

/** The heroes at least two of the players have played, with each one's matches, win rate and KDA on them. */
export function SharedHeroesTable({
  players,
  rows,
  loading,
  gameMode,
  className,
}: {
  players: ComparedPlayer[];
  rows: readonly HeroStats[];
  loading: boolean;
  /** Street Brawl has no soul economy: the tooltips leave out souls per minute. */
  gameMode: GameMode;
  /** Layout from the parent (grid placement). */
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const accountIds = players.map((player) => player.accountId);
  const heroes = sharedHeroes(rows, accountIds);
  const shown = expanded ? heroes : heroes.slice(0, COLLAPSED_ROWS);
  const pending = loading || (heroes.length === 0 && players.some((player) => player.aggregate === undefined));

  return (
    <Panel className={className}>
      <PanelHeader size="sm" title="Shared heroes" />
      {/* A player just added has no rows yet: the old answer's "nothing in common" is not a verdict. */}
      {pending ? (
        // The head row and the collapsed rows, at the loaded rows' height (two lines each), so the table drops in
        // without moving what is below.
        <SkeletonRows rows={COLLAPSED_ROWS + 1} size="lg" variant="solid" className="p-2" />
      ) : heroes.length === 0 ? (
        <EmptyState variant="plain" icon={UsersRound} title="No heroes in common" className="min-h-32" />
      ) : (
        <>
          <Table density="dense" className="tabular-nums" aria-label="Shared heroes">
            <TableHeader tone="muted">
              <TableRow>
                <TableHead data-pinned>Hero</TableHead>
                {players.map((player) => (
                  <PlayerColumnHead key={player.accountId} player={player} crownSlot={false} />
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((hero) => (
                <TableRow key={hero.heroId}>
                  <TableRowHeader data-pinned>
                    {/* Drills in: the whole comparison on this hero. */}
                    <TextLink asChild tone="inherit">
                      <Link
                        to="/analytics/players/compare"
                        search={(prev: Record<string, unknown>) => ({ ...prev, hero: hero.heroId })}
                      >
                        <HeroCell heroId={hero.heroId} size="sm" className="max-w-36" />
                      </Link>
                    </TextLink>
                  </TableRowHeader>
                  {hero.stats.map((stats, index) => (
                    <TableCell key={accountIds[index]} className="text-end">
                      {stats ? (
                        <Tooltip
                          content={
                            <>
                              <TooltipHeader title={players[index].name} subtitle={`${stats.matches} matches`} />
                              <TooltipStats>
                                <TooltipStat label="Record" value={`${stats.wins}W ${stats.matches - stats.wins}L`} />
                                <TooltipStat
                                  label="K / D / A"
                                  value={
                                    kdaText([stats.kills, stats.deaths, stats.assists]) ?? <NoValue label="No data" />
                                  }
                                />
                                {hasSoulEconomy(gameMode) && (
                                  <TooltipStat
                                    label="Souls / min"
                                    value={formatStatValue(stats.netWorthPerMin, "integer") ?? <NoValue />}
                                  />
                                )}
                                <TooltipStat
                                  label="Damage / min"
                                  value={formatStatValue(stats.damagePerMin, "integer") ?? <NoValue />}
                                />
                                <TooltipStat
                                  label="Last played"
                                  value={formatRelativeTime(new Date(stats.lastPlayed * 1000).toISOString())}
                                />
                              </TooltipStats>
                            </>
                          }
                        >
                          <TooltipTarget>
                            <Stack gap={0} align="end" asChild>
                              <span>
                                {/* A narrow table keeps the count and drops the word, so every player's column fits. */}
                                <Text>
                                  {formatStatValue(stats.matches, "integer") ?? <NoValue />}
                                  <span className="sr-only @xl/table:not-sr-only">
                                    {" "}
                                    {stats.matches === 1 ? "match" : "matches"}
                                  </span>
                                </Text>
                                {/* The win rate in the good / bad tone, judged as printed, like the other panels; fixed widths,
                                    so the win rates and the KDAs each line up down the column. */}
                                <Inline gap={1} wrap="nowrap" justify="end" asChild>
                                  <span>
                                    <Text
                                      variant="caption"
                                      tone={toneOf(Math.round(stats.winRate * 100), 50)}
                                      className="whitespace-nowrap @xl/table:w-16 @xl/table:shrink-0 @xl/table:text-end"
                                    >
                                      {formatPercent(stats.winRate, 0)}
                                      <span aria-hidden="true"> WR</span>
                                      <span className="sr-only"> win rate</span>
                                    </Text>
                                    <Text
                                      variant="caption"
                                      tone="muted"
                                      className="hidden whitespace-nowrap @xl/table:inline @xl/table:w-18 @xl/table:shrink-0 @xl/table:text-end"
                                    >
                                      {formatStatValue(stats.kda, "decimal2") ?? <NoValue />} KDA
                                    </Text>
                                  </span>
                                </Inline>
                              </span>
                            </Stack>
                          </TooltipTarget>
                        </Tooltip>
                      ) : players[index].aggregate === undefined ? (
                        // A player just added: the rows on screen are the previous request's, not a verdict.
                        <Skeleton className="ms-auto h-4 w-24" />
                      ) : (
                        <NoValue label="Not played" />
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {heroes.length > COLLAPSED_ROWS && (
            <PanelShowMore open={expanded} onOpenChange={setExpanded} total={heroes.length} />
          )}
        </>
      )}
    </Panel>
  );
}
