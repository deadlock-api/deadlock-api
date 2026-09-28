import { HeroImage } from "~/components/domain/assets/HeroImage";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { Delta } from "~/components/ui/delta";
import { NoValue } from "~/components/ui/no-value";
import { Skeleton } from "~/components/ui/skeleton";
import { Inline, Stack } from "~/components/ui/stack";
import { StatusDot } from "~/components/ui/status-dot";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Text } from "~/components/ui/text";
import { day } from "~/dayjs";
import { useHydrated } from "~/hooks/useHydrated";
import { formatPercent } from "~/lib/format";
import {
  pairMatchCount,
  type PlayerPair,
  pairSynergy,
  playerPairs,
  recentSharedMatches,
  type SharedMatch,
  type SharedMatchTeam,
  splitPairs,
} from "~/lib/player-compare-pairs";
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
  const synergy = pairSynergy(pair);
  const names = (
    <TableCell data-pinned>
      <Stack gap={0.5} className="max-w-40 @md/table:max-w-none">
        <PlayerName player={a} />
        <PlayerName player={b} />
        {pair.lastMet != null && (
          <Text variant="caption" tone="muted" className="@md/table:hidden">
            Met {lastMetLabel(pair.lastMet)}
          </Text>
        )}
      </Stack>
    </TableCell>
  );
  // A pair that never met has no records: one line says so rather than a dash in every column.
  if (pairMatchCount(pair) === 0) {
    return (
      <TableRow>
        {names}
        <TableCell colSpan={4}>
          <Text tone="muted">Never met</Text>
        </TableCell>
      </TableRow>
    );
  }
  return (
    <TableRow>
      {names}
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
        {/* Win rate together minus the average of each one's win rate apart, in points. */}
        {synergy == null ? (
          <NoValue label="Too few matches together" />
        ) : (
          <>
            {/* Delta draws nothing for a change that rounds to zero; an even duo still reads as one. */}
            {Math.round(synergy * 100) === 0 ? (
              <Text tone="muted">±0 pts</Text>
            ) : (
              <Delta value={synergy} digits={0} unit=" pts" />
            )}
            <span className="sr-only"> win rate together compared with apart</span>
          </>
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

function SharedTeam({ team, byId }: { team: SharedMatchTeam; byId: ReadonlyMap<number, ComparedPlayer> }) {
  return (
    <Inline gap={2} className="gap-y-1">
      <Text variant="caption" tone={team.won ? "positive" : "negative"} className="font-semibold">
        <span aria-hidden="true">{team.won ? "W" : "L"}</span>
        <span className="sr-only">{team.won ? "Won:" : "Lost:"}</span>
      </Text>
      {team.players.map((entry) => {
        const player = byId.get(entry.accountId);
        return (
          <Inline key={entry.accountId} gap={1} wrap="nowrap" title={player?.name}>
            {player && <StatusDot color={player.color} />}
            <span className="sr-only">{player?.name ?? `Player ${entry.accountId}`} as</span>
            <HeroImage heroId={entry.heroId} shape="circle" title="" className="size-5" />
            <Text variant="caption" numeric="tabular" className="whitespace-nowrap">
              {entry.kills}/{entry.deaths}/{entry.assists}
            </Text>
          </Inline>
        );
      })}
    </Inline>
  );
}

function SharedMatchRow({
  match,
  byId,
  lastMetLabel,
}: {
  match: SharedMatch;
  byId: ReadonlyMap<number, ComparedPlayer>;
  lastMetLabel: (unix: number) => string;
}) {
  const [first, second] = match.teams;
  return (
    // Not a link: the site has no public match page (the tracker's scoreboard is for signed-in patrons).
    <Inline gap={3} asChild className="gap-y-1 px-3 py-1.5">
      <li>
        <Text variant="caption" tone="muted" className="w-24 shrink-0 whitespace-nowrap">
          {lastMetLabel(match.startTime)}
        </Text>
        <Inline gap={3} className="gap-y-1">
          <SharedTeam team={first} byId={byId} />
          {second && (
            <>
              <Text variant="caption" tone="muted">
                vs
              </Text>
              <SharedTeam team={second} byId={byId} />
            </>
          )}
        </Inline>
      </li>
    </Inline>
  );
}

/** A pair's row while the match histories load: the names, and a placeholder where each record goes. */
function PairRowSkeleton({ a, b }: { a: ComparedPlayer; b: ComparedPlayer }) {
  return (
    <TableRow aria-hidden="true">
      <TableCell data-pinned>
        <Stack gap={0.5} className="max-w-40 @md/table:max-w-none">
          <PlayerName player={a} />
          <PlayerName player={b} />
        </Stack>
      </TableCell>
      {[0, 1, 2].map((cell) => (
        <TableCell key={cell} className="text-end">
          <Skeleton className="ms-auto h-4 w-16" />
        </TableCell>
      ))}
      <TableCell className="hidden text-end @md/table:table-cell">
        <Skeleton className="ms-auto h-4 w-20" />
      </TableCell>
    </TableRow>
  );
}

/**
 * Every pair of compared players: the matches they played on the same team with that team's record, the matches
 * they played against each other with the head-to-head, and when they last met; then the newest matches two or more of
 * them shared, newest first. Pairs that never met come last, their records empty. While the histories load, every
 * pair holds its row, so the panel keeps its place (and its column beside heroes and items) from the first render.
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
  const pairs = [...met, ...neverMet];
  const recent = recentSharedMatches(histories);
  const loadingPairs = players.flatMap((a, i) => players.slice(i + 1).map((b) => [a, b] as const));

  return (
    <Panel className={className}>
      <PanelHeader size="sm" title="Together & against" />
      {failed.map((history) => {
        const player = byId.get(history.accountId);
        return player ? <HistoryError key={history.accountId} player={player} history={history} /> : null;
      })}
      {/* Nobody met: one line instead of a table of empty rows. */}
      {!loading && pairs.length > 0 && met.length === 0 && (
        <PanelBody size="sm">
          <Text tone="muted">{pairs.length === 1 ? "Never met" : "No two of them have met"} on these dates</Text>
        </PanelBody>
      )}
      {(loading || met.length > 0) && (
        <Table density="dense" className="tabular-nums" aria-busy={loading || undefined}>
          <TableHeader tone="muted">
            <TableRow>
              <TableHead data-pinned>Players</TableHead>
              <TableHead className="text-end">Together</TableHead>
              <TableHead className="text-end">Synergy</TableHead>
              <TableHead className="text-end">Against</TableHead>
              <TableHead className="hidden text-end @md/table:table-cell">Last met</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? loadingPairs.map(([a, b]) => <PairRowSkeleton key={`${a.accountId}-${b.accountId}`} a={a} b={b} />)
              : pairs.map((pair) => {
                  const a = byId.get(pair.a);
                  const b = byId.get(pair.b);
                  if (!a || !b) return null;
                  return <PairRow key={`${pair.a}-${pair.b}`} pair={pair} a={a} b={b} lastMetLabel={lastMetLabel} />;
                })}
          </TableBody>
        </Table>
      )}
      {recent.length > 0 && (
        <>
          <PanelHeader size="sm" title="Recent shared matches" />
          <Stack gap={0} asChild>
            <ul aria-label="Recent shared matches">
              {recent.map((match) => (
                <SharedMatchRow key={match.matchId} match={match} byId={byId} lastMetLabel={lastMetLabel} />
              ))}
            </ul>
          </Stack>
        </>
      )}
    </Panel>
  );
}
