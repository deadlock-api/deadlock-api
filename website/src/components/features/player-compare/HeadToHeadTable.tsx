import { useQuery } from "@tanstack/react-query";
import type { Rank } from "deadlock_api_client";
import { Fragment } from "react";

import { BadgeImage } from "~/components/domain/assets/BadgeImage";
import { Panel, PanelHeader } from "~/components/patterns/panel/Panel";
import { NoValue } from "~/components/ui/no-value";
import { Skeleton } from "~/components/ui/skeleton";
import { Inline } from "~/components/ui/stack";
import { StatusDot } from "~/components/ui/status-dot";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Text } from "~/components/ui/text";
import { COMPARE_STAT_GROUPS, type CompareStat, compareStatWinners, scoreComparison } from "~/lib/player-compare";
import { formatPlayerMetricValue } from "~/lib/player-metrics";
import { badgeLabel } from "~/lib/rank-utils";
import { ranksQueryOptions } from "~/queries/ranks-query";

import type { ComparedPlayer } from "./types";

/** One value as the table shows it: a number in its format, or a rank as its badge and name. */
function StatValue({ stat, value, ranks }: { stat: CompareStat; value: number | null; ranks: Rank[] }) {
  if (value == null) return <NoValue />;
  if (stat.format !== "rank") return <>{formatPlayerMetricValue(value, stat.format)}</>;
  return (
    <Inline gap={1} wrap="nowrap" justify="end" asChild>
      <span>
        <BadgeImage badge={value} ranks={ranks} size="inline" alt="" />
        {/* A narrow table keeps the badge and gives the name's room to the other players' columns. */}
        <span className="sr-only @md/table:not-sr-only">{badgeLabel(ranks, value)}</span>
      </span>
    </Inline>
  );
}

/**
 * Every stat in a row, a column per player; the best value of each row is set in the brand color and a heavier weight,
 * so the win does not rest on color alone.
 */
export function HeadToHeadTable({
  players,
  ...props
}: {
  players: ComparedPlayer[];
} & React.ComponentProps<typeof Panel>) {
  const { data: ranks = [] } = useQuery(ranksQueryOptions);
  const aggregates = players.map((player) => player.aggregate);
  const { stats, scored, tally, leaders, settled } = scoreComparison(aggregates);
  // "Heroes played: 1" for everyone (one hero's filter) says nothing.
  const shown = stats.filter(
    (stat) => stat.key !== "heroesPlayed" || aggregates.some((aggregate) => aggregate?.heroesPlayed !== 1),
  );
  const winnersOf = (stat: CompareStat) => compareStatWinners(aggregates, stat);
  const scoring = settled && players.length >= 2;

  return (
    <Panel {...props}>
      <PanelHeader
        size="sm"
        title="Head to head"
        description="The best value of each stat is highlighted; ties share the win"
      />
      <Table density="dense" className="tabular-nums">
        <TableHeader tone="muted">
          <TableRow>
            <TableHead data-pinned>Stat</TableHead>
            {players.map((player) => (
              <TableHead key={player.accountId} className="text-end">
                <Inline gap={1} wrap="nowrap" justify="end">
                  <StatusDot color={player.color} />
                  {player.profileLoading ? (
                    <Skeleton className="h-4 w-20" />
                  ) : (
                    <span className="max-w-20 truncate @md/table:max-w-32" title={player.name}>
                      {player.name}
                    </span>
                  )}
                </Inline>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {COMPARE_STAT_GROUPS.map((group) => {
            const groupStats = shown.filter((stat) => stat.group === group);
            if (groupStats.length === 0) return null;
            // Each player's wins in this group, so a reader sees where a lead comes from.
            const groupTally = players.map(
              (_, index) => groupStats.filter((stat) => winnersOf(stat).includes(index)).length,
            );
            const groupScored = groupStats.some((stat) => stat.polarity !== "none");
            return (
              <Fragment key={group}>
                <TableRow>
                  <TableHead scope="rowgroup" data-pinned>
                    <Text variant="label">{group}</Text>
                  </TableHead>
                  {players.map((player, index) => (
                    <TableCell key={player.accountId} className="text-end">
                      {scoring && groupScored && (
                        <Text variant="caption" tone="muted">
                          {groupTally[index]} won
                        </Text>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
                {groupStats.map((stat) => {
                  const values = aggregates.map((aggregate) => aggregate?.[stat.key]);
                  const winners = winnersOf(stat);
                  return (
                    <TableRow key={stat.key}>
                      <TableCell
                        data-pinned
                        className="whitespace-normal text-muted-foreground @md/table:whitespace-nowrap"
                      >
                        {stat.label}
                        {stat.polarity === "lower" && <span className="sr-only"> (lower is better)</span>}
                      </TableCell>
                      {players.map((player, index) => {
                        const won = winners.includes(index);
                        const value = values[index];
                        return (
                          <TableCell key={player.accountId} className="text-end">
                            {player.aggregate === null ? (
                              <Text tone="muted">No matches</Text>
                            ) : value === undefined ? (
                              <Skeleton className="ms-auto h-4 w-12" />
                            ) : (
                              <Inline gap={1} wrap="nowrap" justify="end">
                                <Text tone={won ? "primary" : undefined} className={won ? "font-semibold" : undefined}>
                                  <StatValue stat={stat} value={value} ranks={ranks} />
                                </Text>
                                {won && <span className="sr-only">, best</span>}
                              </Inline>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </Fragment>
            );
          })}
        </TableBody>
        {/* The result of the table: how many of the scored rows each player won. */}
        <TableFooter tone="highlight">
          <TableRow>
            <TableCell data-pinned>Stats won</TableCell>
            {players.map((player, index) => {
              const leads = settled && leaders.includes(index);
              return (
                <TableCell key={player.accountId} className="text-end">
                  {!settled ? (
                    <Skeleton className="ms-auto h-4 w-12" />
                  ) : players.length < 2 ? (
                    <NoValue label="Add an opponent to score" />
                  ) : (
                    <Inline gap={1} wrap="nowrap" justify="end">
                      <Text tone={leads ? "primary" : undefined} className={leads ? "font-bold" : undefined}>
                        {tally[index]} of {scored.length}
                      </Text>
                      {leads && <span className="sr-only">, the most</span>}
                    </Inline>
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        </TableFooter>
      </Table>
    </Panel>
  );
}
