import { useQuery } from "@tanstack/react-query";
import type { Rank } from "deadlock_api_client";
import { XIcon } from "lucide-react";

import { BadgeImage } from "~/components/domain/assets/BadgeImage";
import { PlayerSearch } from "~/components/domain/player/PlayerSearch";
import { Panel, PanelHeader } from "~/components/patterns/panel/Panel";
import { Button } from "~/components/ui/button";
import { useReorder } from "~/components/ui/hooks/use-reorder";
import { NoValue } from "~/components/ui/no-value";
import { ReorderHandle } from "~/components/ui/reorder-handle";
import { Skeleton } from "~/components/ui/skeleton";
import { Inline } from "~/components/ui/stack";
import { StatusDot } from "~/components/ui/status-dot";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Text } from "~/components/ui/text";
import { type CompareStat, scoreComparison, statWinners } from "~/lib/player-compare";
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
        <BadgeImage badge={value} ranks={ranks} size="inline" />
        {badgeLabel(ranks, value)}
      </span>
    </Inline>
  );
}

/** A column's player name, cut to fit with the full name on hover. */
function PlayerName({ name }: { name: string }) {
  return (
    <span className="max-w-24 truncate" title={name}>
      {name}
    </span>
  );
}

/**
 * Every stat in a row, a column per player; the best value of each row is set in the brand color and a heavier weight,
 * so the win does not rest on color alone.
 */
export function HeadToHeadTable({
  players,
  isFull,
  onAdd,
  onRemove,
  onMove,
  ...props
}: {
  players: ComparedPlayer[];
  isFull: boolean;
  onAdd: (accountId: number) => void;
  onRemove: (accountId: number) => void;
  /** Reorders the players: the one at `from` goes to `to`. */
  onMove: (from: number, to: number) => void;
} & React.ComponentProps<typeof Panel>) {
  const { data: ranks = [] } = useQuery(ranksQueryOptions);
  const reorder = useReorder({
    count: players.length,
    onMove,
    itemLabel: (index) => players[index]?.name ?? `Player ${index + 1}`,
  });
  const aggregates = players.map((player) => player.aggregate);
  const { stats, scored, tally, leaders, settled } = scoreComparison(aggregates);

  return (
    <Panel {...props}>
      <PanelHeader size="sm" title="Head to head">
        {!isFull && (
          <PlayerSearch
            variant="outline"
            size="xs"
            label="Add player"
            align="end"
            disabledAccountIds={players.map((player) => player.accountId)}
            onValueChange={(player) => onAdd(player.accountId)}
          />
        )}
      </PanelHeader>
      <Table density="dense" width="hug" className="tabular-nums">
        <TableHeader tone="muted">
          <TableRow>
            <TableHead data-pinned>Stat</TableHead>
            {players.map((player, index) => (
              <TableHead key={player.accountId} className="text-end">
                <Inline gap={1} wrap="nowrap" justify="end">
                  <StatusDot color={player.color} />
                  {player.profileLoading ? (
                    <Skeleton className="h-4 w-20" />
                  ) : // With two or more players the name is the handle that moves them: drag it, or the arrow keys.
                  players.length >= 2 ? (
                    <ReorderHandle aria-label={`Move ${player.name}`} {...reorder.itemProps(index)}>
                      <PlayerName name={player.name} />
                    </ReorderHandle>
                  ) : (
                    <PlayerName name={player.name} />
                  )}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${player.name}`}
                    onClick={() => onRemove(player.accountId)}
                  >
                    <XIcon aria-hidden="true" />
                  </Button>
                </Inline>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {stats.map((stat) => {
            const values = aggregates.map((aggregate) => aggregate?.[stat.key]);
            const winners = statWinners(values, stat.polarity);
            return (
              <TableRow key={stat.key}>
                <TableCell data-pinned className="text-muted-foreground">
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
      <span className="sr-only" aria-live="polite">
        {reorder.announcement}
      </span>
    </Panel>
  );
}
