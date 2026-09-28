import { Panel, PanelFooter, PanelHeader } from "~/components/patterns/panel/Panel";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { NoValue } from "~/components/ui/no-value";
import { Inline, Stack } from "~/components/ui/stack";
import { StatusDot } from "~/components/ui/status-dot";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Text } from "~/components/ui/text";
import { day } from "~/dayjs";
import { useHydrated } from "~/hooks/useHydrated";
import { formatPercent } from "~/lib/format";
import { type PlayerPair, playerPairs, splitPairs } from "~/lib/player-compare-pairs";
import { formatStatValue } from "~/lib/stat-format";
import { toneOf } from "~/lib/tone";

import type { ComparedPlayer } from "./types";
import type { CompareMatchHistory } from "./useCompareMatchHistories";

function plural(count: number, noun: string): string {
  return `${formatStatValue(count, "integer")} ${count === 1 ? noun : `${noun}es`}`;
}

/**
 * "3 days ago" once hydrated; before that the absolute UTC date, which the server and the first client render agree
 * on (the Worker renders in UTC and its clock never matches the viewer's).
 */
function useLastMetLabel(): (unix: number) => string {
  const hydrated = useHydrated();
  const now = hydrated ? day() : null;
  return (unix) => (now ? day.unix(unix).from(now) : day.unix(unix).utc().format("MMM D, YYYY"));
}

function PlayerName({ player }: { player: ComparedPlayer }) {
  return (
    <Inline gap={1.5} wrap="nowrap">
      <StatusDot color={player.color} />
      <Text wrap="truncate" title={player.name}>
        {player.name}
      </Text>
    </Inline>
  );
}

function HistoryError({ player, history }: { player: ComparedPlayer; history: CompareMatchHistory }) {
  return history.isPrivate ? (
    <ErrorState variant="inline" title={`${player.name}'s match history is private`} />
  ) : (
    <ErrorState variant="inline" title={`${player.name}'s matches did not load`} onRetry={history.refetch} />
  );
}

function PairRow({
  pair,
  a,
  b,
  lastMetLabel,
}: {
  pair: PlayerPair;
  a: ComparedPlayer;
  b: ComparedPlayer;
  lastMetLabel: (unix: number) => string;
}) {
  const { together, against } = pair;
  const togetherLosses = together.matches - together.wins;
  const winRate = together.matches > 0 ? together.wins / together.matches : null;
  return (
    <TableRow>
      <TableCell data-pinned>
        <Stack gap={0.5} className="max-w-40">
          <PlayerName player={a} />
          <PlayerName player={b} />
          {pair.lastMet != null && (
            <Text variant="caption" tone="muted" className="@md/table:hidden">
              Met {lastMetLabel(pair.lastMet)}
            </Text>
          )}
        </Stack>
      </TableCell>
      <TableCell className="text-end">
        {together.matches > 0 ? (
          <Stack gap={0} align="end">
            <Text>{plural(together.matches, "match")}</Text>
            <Text variant="caption" tone="muted" className="whitespace-nowrap">
              {together.wins}W {togetherLosses}L ·{" "}
              <Text tone={toneOf(winRate, 0.5)}>{formatPercent(winRate ?? 0, 0)} WR</Text>
            </Text>
          </Stack>
        ) : (
          <NoValue label="Never on the same team" />
        )}
      </TableCell>
      <TableCell className="text-end">
        {against.matches > 0 ? (
          <Stack gap={0} align="end">
            <Text>{plural(against.matches, "match")}</Text>
            <Inline gap={1} wrap="nowrap" justify="end">
              <StatusDot color={a.color} />
              <Text variant="caption" tone="muted" className="whitespace-nowrap">
                <span aria-hidden="true">
                  {against.aWins} – {against.bWins}
                </span>
                <span className="sr-only">
                  {a.name} won {against.aWins}, {b.name} won {against.bWins}
                </span>
              </Text>
              <StatusDot color={b.color} />
            </Inline>
          </Stack>
        ) : (
          <NoValue label="Never on opposite teams" />
        )}
      </TableCell>
      <TableCell className="hidden text-end whitespace-nowrap @md/table:table-cell">
        {pair.lastMet != null ? <Text tone="muted">{lastMetLabel(pair.lastMet)}</Text> : <NoValue />}
      </TableCell>
    </TableRow>
  );
}

/**
 * Every pair of compared players: the matches they played on the same team with that team's record, the matches
 * they played against each other with the head-to-head, and when they last met. Pairs that never met share one line.
 */
export function TogetherAgainstPanel({
  players,
  histories,
  className,
}: {
  players: ComparedPlayer[];
  /** The players' match histories on the filters, in the players' order (`useCompareMatchHistories`). */
  histories: readonly CompareMatchHistory[];
  /** Layout from the parent (grid placement). */
  className?: string;
}) {
  const lastMetLabel = useLastMetLabel();
  const byId = new Map(players.map((player) => [player.accountId, player]));
  const failed = histories.filter((history) => history.isError);
  const loading = histories.some((history) => history.isPending && !history.isError);
  const { met, neverMet } = splitPairs(playerPairs(histories));
  const nameOf = (accountId: number) => byId.get(accountId)?.name ?? `Player ${accountId}`;
  const neverMetLine = `Never met: ${neverMet.map((pair) => `${nameOf(pair.a)} & ${nameOf(pair.b)}`).join(", ")}`;
  // Only there when it has something to show: it sits last in its column, so appearing once loaded moves nothing.
  // A failed history still shows, with its retry.
  if (loading || (met.length === 0 && failed.length === 0)) return null;

  return (
    <Panel className={className}>
      <PanelHeader size="sm" title="Together & against" />
      {failed.map((history) => {
        const player = byId.get(history.accountId);
        return player ? <HistoryError key={history.accountId} player={player} history={history} /> : null;
      })}
      {met.length > 0 && (
        <Table density="dense" className="tabular-nums">
          <TableHeader tone="muted">
            <TableRow>
              <TableHead data-pinned>Players</TableHead>
              <TableHead className="text-end">Together</TableHead>
              <TableHead className="text-end">Against</TableHead>
              <TableHead className="hidden text-end @md/table:table-cell">Last met</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {met.map((pair) => {
              const a = byId.get(pair.a);
              const b = byId.get(pair.b);
              if (!a || !b) return null;
              return <PairRow key={`${pair.a}-${pair.b}`} pair={pair} a={a} b={b} lastMetLabel={lastMetLabel} />;
            })}
          </TableBody>
        </Table>
      )}
      {neverMet.length > 0 && (
        // Two lines at most: with five players the list runs long; the full list is in the title.
        <PanelFooter title={neverMetLine}>
          {/* Clamped inside the footer's padding, so a third line never peeks out. */}
          <span className="line-clamp-2">{neverMetLine}</span>
        </PanelFooter>
      )}
    </Panel>
  );
}
