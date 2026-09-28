import type { HeroStats } from "deadlock_api_client";
import { useState } from "react";

import { HeroCell } from "~/components/domain/assets/HeroCell";
import { Panel, PanelHeader, PanelShowMore } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { NoValue } from "~/components/ui/no-value";
import { Skeleton } from "~/components/ui/skeleton";
import { Inline, Stack } from "~/components/ui/stack";
import { StatusDot } from "~/components/ui/status-dot";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Text } from "~/components/ui/text";
import { Tooltip, TooltipHeader, TooltipStat, TooltipStats, TooltipTarget } from "~/components/ui/tooltip";
import { formatPercent, formatRelativeTime } from "~/lib/format";
import { sharedHeroes } from "~/lib/player-compare";
import { formatStatValue } from "~/lib/stat-format";

import type { ComparedPlayer } from "./types";

const COLLAPSED_ROWS = 8;

/** The heroes at least two of the players have played, with each one's matches, win rate and KDA on them. */
export function SharedHeroesTable({
  players,
  rows,
  loading,
}: {
  players: ComparedPlayer[];
  rows: readonly HeroStats[];
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const accountIds = players.map((player) => player.accountId);
  const heroes = sharedHeroes(rows, accountIds);
  const shown = expanded ? heroes : heroes.slice(0, COLLAPSED_ROWS);

  return (
    <Panel>
      <PanelHeader size="sm" title="Shared heroes" />
      {/* A player just added has no rows yet: the old answer's "nothing in common" is not a verdict. */}
      {loading || (heroes.length === 0 && players.some((player) => player.aggregate === undefined)) ? (
        <Stack gap={2} className="p-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </Stack>
      ) : heroes.length === 0 ? (
        <EmptyState variant="plain" title="No hero in common on these filters." />
      ) : (
        <>
          <Table density="dense" className="tabular-nums">
            <TableHeader tone="muted">
              <TableRow>
                <TableHead data-pinned>Hero</TableHead>
                {players.map((player) => (
                  <TableHead key={player.accountId} className="text-end">
                    <Inline gap={1.5} wrap="nowrap" justify="end">
                      <StatusDot color={player.color} />
                      <span className="max-w-32 truncate" title={player.name}>
                        {player.name}
                      </span>
                    </Inline>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((hero) => (
                <TableRow key={hero.heroId}>
                  <TableCell data-pinned>
                    <HeroCell heroId={hero.heroId} size="sm" linkToDetail className="max-w-40" />
                  </TableCell>
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
                                  value={[stats.kills, stats.deaths, stats.assists]
                                    .map((v) => formatStatValue(v, "decimal1"))
                                    .join(" / ")}
                                />
                                <TooltipStat
                                  label="Souls / min"
                                  value={formatStatValue(stats.netWorthPerMin, "integer")}
                                />
                                <TooltipStat
                                  label="Damage / min"
                                  value={formatStatValue(stats.damagePerMin, "integer")}
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
                                <Text>
                                  {formatStatValue(stats.matches, "integer")}{" "}
                                  {stats.matches === 1 ? "match" : "matches"}
                                </Text>
                                <Text variant="caption" tone="muted">
                                  {formatPercent(stats.winRate, 0)} WR · {formatStatValue(stats.kda, "decimal2")} KDA
                                </Text>
                              </span>
                            </Stack>
                          </TooltipTarget>
                        </Tooltip>
                      ) : players[index].aggregate === undefined ? (
                        // A player just added: the rows on screen are the previous request's, not a verdict.
                        <Skeleton className="ms-auto h-8 w-20" />
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
