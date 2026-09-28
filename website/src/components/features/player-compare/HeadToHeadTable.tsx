import { useQuery } from "@tanstack/react-query";
import type { Rank } from "deadlock_api_client";
import { CrownIcon } from "lucide-react";

import { BadgeImage } from "~/components/domain/assets/BadgeImage";
import { Panel, PanelHeader } from "~/components/patterns/panel/Panel";
import { NoValue } from "~/components/ui/no-value";
import { Skeleton } from "~/components/ui/skeleton";
import { Inline } from "~/components/ui/stack";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Text } from "~/components/ui/text";
import { COMPARE_STAT_GROUPS, type CompareStat, compareStatWinners, scoreComparison } from "~/lib/player-compare";
import { formatPlayerMetricValue } from "~/lib/player-metrics";
import { badgeLabel } from "~/lib/rank-utils";
import { ranksQueryOptions } from "~/queries/ranks-query";

import { PlayerColumnHead, RowValue } from "./CompareTableParts";
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
        <span className="sr-only whitespace-nowrap @md/table:not-sr-only">{badgeLabel(ranks, value)}</span>
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
  // "Heroes played: 1" for everyone with matches (one hero's filter) says nothing; kept while anyone loads.
  const shown = stats.filter(
    (stat) =>
      stat.key !== "heroesPlayed" ||
      aggregates.some((aggregate) => aggregate === undefined || (aggregate !== null && aggregate.heroesPlayed !== 1)),
  );
  const winnersOf = (stat: CompareStat) => compareStatWinners(aggregates, stat);
  // Two players with matches make a contest; a player without any is shown but not scored.
  const contest = aggregates.filter((aggregate) => aggregate !== null).length >= 2;
  const scoring = settled && contest;

  return (
    <Panel {...props}>
      <PanelHeader size="sm" title="Head to head" />
      <Table density="dense" height="fill" className="tabular-nums">
        <TableHeader tone="muted">
          <TableRow>
            <TableHead data-pinned>Stat</TableHead>
            {players.map((player) => (
              <PlayerColumnHead key={player.accountId} player={player} />
            ))}
          </TableRow>
        </TableHeader>
        {/* A body per group, so each group's `rowgroup` header names only its own rows. */}
        {COMPARE_STAT_GROUPS.map((group) => {
          const groupStats = shown.filter((stat) => stat.group === group);
          if (groupStats.length === 0) return null;
          // Each player's wins in this group, so a reader sees where a lead comes from.
          const groupTally = players.map(
            (_, index) => groupStats.filter((stat) => winnersOf(stat).includes(index)).length,
          );
          const groupScored = groupStats.some((stat) => stat.polarity !== "none");
          return (
            <TableBody key={group}>
              <TableRow tone="section">
                <TableHead scope="rowgroup" data-pinned>
                  <Text variant="label" as="div" className="max-w-24 whitespace-normal @md/table:max-w-none">
                    {group}
                  </Text>
                </TableHead>
                {players.map((player, index) => (
                  <TableCell key={player.accountId} className="text-end">
                    {scoring && groupScored && groupTally[index] > 0 && (
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
                    <TableCell data-pinned className="text-muted-foreground">
                      {/* A table cell ignores max-width: the label's own box wraps it in a narrow table. */}
                      <span className="block max-w-24 whitespace-normal @md/table:max-w-none @md/table:whitespace-nowrap">
                        {stat.label}
                      </span>
                      {stat.polarity === "lower" && <span className="sr-only"> (lower is better)</span>}
                    </TableCell>
                    {players.map((player, index) => {
                      const won = winners.includes(index);
                      const value = values[index];
                      return (
                        <TableCell key={player.accountId} className="text-end">
                          {player.aggregate === null ? (
                            // Said once, in the matches row; the other rows of that column are empty, but for the
                            // rank, which is the player's whatever the filters.
                            stat.key === "rankBadge" && player.rankBadge ? (
                              <Text tone="muted">
                                <StatValue stat={stat} value={player.rankBadge} ranks={ranks} />
                              </Text>
                            ) : stat.key === "matches" ? (
                              <Text tone="muted">No matches</Text>
                            ) : (
                              <NoValue label="No matches" />
                            )
                          ) : value === undefined ? (
                            <Skeleton className="ms-auto h-4 w-12" />
                          ) : (
                            <RowValue won={won}>
                              <StatValue stat={stat} value={value} ranks={ranks} />
                            </RowValue>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          );
        })}
        {/* The result of the table: how many of the scored rows each player won. */}
        {contest && (
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
                        {leads && <CrownIcon aria-hidden="true" className="size-3.5 shrink-0" />}
                        <Text className={leads ? "font-bold" : undefined}>
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
        )}
      </Table>
    </Panel>
  );
}
