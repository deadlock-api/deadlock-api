import { useState } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { Panel, PanelBody, PanelHeader, PanelShowMore } from "~/components/patterns/panel/Panel";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { NoValue } from "~/components/ui/no-value";
import { Skeleton } from "~/components/ui/skeleton";
import { Inline, Stack } from "~/components/ui/stack";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Text } from "~/components/ui/text";
import { day } from "~/dayjs";
import { useHydrated } from "~/hooks/useHydrated";
import { type GameMode, hasSoulEconomy } from "~/lib/game-mode";
import { recentSharedMatches, type SharedMatch } from "~/lib/player-compare-pairs";
import { formatStatValue } from "~/lib/stat-format";

import { PlayerColumnHead } from "./CompareTableParts";
import type { ComparedPlayer } from "./types";
import type { CompareMatchHistory } from "./useCompareMatchHistories";

/** Souls as a match line reads them: "32.4k". */
function compactSouls(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : formatStatValue(value, "integer");
}

/** Up to a week back a match reads "3 days ago"; older ones read as their date, which says more than "a month ago". */
const RELATIVE_DAYS = 7;

/**
 * "3 days ago" or "Aug 28" once hydrated; before that the absolute UTC date, which the server and the first client
 * render agree on (the Worker renders in UTC and its clock never matches the viewer's).
 */
function useMatchDateLabel(): (unix: number) => string {
  const hydrated = useHydrated();
  const now = hydrated ? day() : null;
  return (unix) => {
    const date = day.unix(unix);
    if (!now) return date.utc().format("MMM D, YYYY");
    if (now.diff(date, "day") < RELATIVE_DAYS) return date.from(now);
    return date.format(date.year() === now.year() ? "MMM D" : "MMM D, YYYY");
  };
}

function HistoryError({ player, history }: { player: ComparedPlayer; history: CompareMatchHistory }) {
  return history.isPrivate ? (
    <ErrorState variant="inline" title={`${player.name}'s match history is private`} />
  ) : (
    <ErrorState variant="inline" title={`${player.name}'s matches did not load`} onRetry={history.refetch} />
  );
}

/**
 * The matches two or more of the players shared, one line each: when, then a column per player (in
 * the page's order) with their result, hero, K/D/A and souls (not in Street Brawl), so every value lines up down the column. A player who
 * was not in the match leaves the cell empty; the W and L tell who was on which side.
 */
function SharedMatchesTable({
  matches,
  players,
  dateLabel,
  showSouls,
}: {
  matches: readonly SharedMatch[];
  players: ComparedPlayer[];
  dateLabel: (unix: number) => string;
  /** Off in Street Brawl, where every player gets the same souls each round. */
  showSouls: boolean;
}) {
  // Only the players who appear in these matches get a column.
  const inAny = new Set(
    matches.flatMap((match) => match.teams.flatMap((team) => team.players.map((p) => p.accountId))),
  );
  const columns = players.filter((player) => inAny.has(player.accountId));
  return (
    // Not links: the site has no public match page (the tracker's scoreboard is for signed-in patrons).
    <Table density="dense" className="tabular-nums" aria-label="Shared matches">
      <TableHeader tone="muted">
        <TableRow>
          <TableHead data-pinned>Match</TableHead>
          {columns.map((player) => (
            <PlayerColumnHead key={player.accountId} player={player} crownSlot={false} align="start" />
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {matches.map((match) => (
          <TableRow key={match.matchId}>
            <TableCell data-pinned>
              <Text tone="muted" className="whitespace-nowrap">
                {dateLabel(match.startTime)}
              </Text>
            </TableCell>
            {columns.map((player) => {
              const team = match.teams.find((candidate) =>
                candidate.players.some((entry) => entry.accountId === player.accountId),
              );
              const entry = team?.players.find((candidate) => candidate.accountId === player.accountId);
              return (
                <TableCell
                  key={player.accountId}
                  className="text-end"
                  tone={team ? (team.won ? "positive" : "negative") : "default"}
                >
                  {team && entry ? (
                    <Inline gap={1.5} wrap="nowrap" justify="end">
                      {/* Fixed widths, none shrinking: the letters, heroes and numbers line up down the column. */}
                      <Text
                        tone={team.won ? "positive" : "negative"}
                        className="w-4 shrink-0 text-center font-semibold"
                      >
                        <span aria-hidden="true">{team.won ? "W" : "L"}</span>
                        <span className="sr-only">{team.won ? "Won" : "Lost"} as</span>
                      </Text>
                      <HeroImage heroId={entry.heroId} shape="circle" className="size-5 shrink-0" />
                      <Text className="w-16 shrink-0 text-end whitespace-nowrap">
                        {entry.kills}/{entry.deaths}/{entry.assists}
                      </Text>
                      {showSouls && (
                        <Text tone="muted" className="w-12 shrink-0 text-end whitespace-nowrap">
                          {compactSouls(entry.netWorth)}
                          <span className="sr-only"> souls</span>
                        </Text>
                      )}
                    </Inline>
                  ) : (
                    <NoValue label="Not in this match" />
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const COLLAPSED_ROWS = 9;

/**
 * Every match two or more of the compared players shared on the filters, newest first: the first few, and the rest
 * behind "Show all". While the histories load, placeholder rows hold the panel's place.
 */
export function SharedMatchesPanel({
  players,
  histories,
  gameMode,
  className,
}: {
  players: ComparedPlayer[];
  /** The players' match histories on the filters, in the players' order (`useCompareMatchHistories`). */
  histories: readonly CompareMatchHistory[];
  /** Street Brawl has no soul economy: the lines leave out each player's souls. */
  gameMode: GameMode;
  /** Layout from the parent (grid placement). */
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const dateLabel = useMatchDateLabel();
  const byId = new Map(players.map((player) => [player.accountId, player]));
  const failed = histories.filter((history) => history.isError);
  const loading = histories.some((history) => history.isPending && !history.isError);
  const matches = recentSharedMatches(histories, Infinity);
  const shown = expanded ? matches : matches.slice(0, COLLAPSED_ROWS);

  return (
    <Panel className={className}>
      <PanelHeader size="sm" title="Shared matches" />
      {failed.map((history) => {
        const player = byId.get(history.accountId);
        return player ? <HistoryError key={history.accountId} player={player} history={history} /> : null;
      })}
      {loading ? (
        <Stack gap={2} className="p-2" aria-busy="true">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </Stack>
      ) : matches.length > 0 ? (
        <>
          <SharedMatchesTable
            matches={shown}
            players={players}
            dateLabel={dateLabel}
            showSouls={hasSoulEconomy(gameMode)}
          />
          {matches.length > COLLAPSED_ROWS && (
            <PanelShowMore open={expanded} onOpenChange={setExpanded} total={matches.length} />
          )}
        </>
      ) : (
        // Only a verdict when every history is in: a failed one leaves its matches unknown, not unshared.
        failed.length === 0 && (
          <PanelBody size="sm">
            <Text tone="muted">{players.length === 2 ? "Never met" : "No two of them have met"} on these dates</Text>
          </PanelBody>
        )
      )}
    </Panel>
  );
}
