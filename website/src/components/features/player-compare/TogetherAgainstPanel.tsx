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
  duoHeroPairs,
  type DuoHeroes,
  MIN_DUO_HEROES_MATCHES,
  type PlayerPair,
  pairSynergy,
  playerPairs,
  recentSharedMatches,
  type SharedMatch,
  splitPairs,
} from "~/lib/player-compare-pairs";
import { formatStatValue } from "~/lib/stat-format";
import { toneOf } from "~/lib/tone";

import { PlayerColumnHead } from "./CompareTableParts";
import type { ComparedPlayer } from "./types";
import type { CompareMatchHistory } from "./useCompareMatchHistories";

/** The optional columns of the pairs table. */
interface PairColumns {
  synergy: boolean;
  duo: boolean;
  against: boolean;
}

/** Souls as a match line reads them: "32.4k". */
function compactSouls(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : formatStatValue(value, "integer");
}

/** The duo heroes column: only where the table is wide enough to spare it. */
const DUO_COLUMN = "hidden text-end @2xl/table:table-cell";

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
  duos,
  columns,
  lastMetLabel,
}: {
  pair: PlayerPair;
  a: ComparedPlayer;
  b: ComparedPlayer;
  /** The pair's most played hero pairings as teammates. */
  duos: readonly DuoHeroes[];
  /** Which of the optional columns the table shows: those with something to say for some pair. */
  columns: PairColumns;
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
      {columns.synergy && (
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
      )}
      {columns.duo && (
        <TableCell className={DUO_COLUMN}>
          {duos.length === 0 ? (
            <NoValue label="No hero pairing played three times" />
          ) : (
            <Stack gap={0.5} align="end">
              {duos.map((duo) => (
                <Inline key={`${duo.aHero}-${duo.bHero}`} gap={1} wrap="nowrap" justify="end">
                  <HeroImage heroId={duo.aHero} shape="circle" className="size-5" />
                  <HeroImage heroId={duo.bHero} shape="circle" className="size-5" />
                  {/* Fixed widths, so the heroes and the numbers line up down the column. */}
                  <Text variant="caption" tone="muted" numeric="tabular" className="w-18 text-end whitespace-nowrap">
                    {plural(duo.matches, "match")}
                  </Text>
                  <Text
                    variant="caption"
                    tone={toneOf(duo.wins / duo.matches, 0.5)}
                    numeric="tabular"
                    className="w-14 text-end whitespace-nowrap"
                  >
                    {formatPercent(duo.wins / duo.matches, 0)} WR
                  </Text>
                </Inline>
              ))}
            </Stack>
          )}
        </TableCell>
      )}
      {columns.against && (
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
      )}
      <TableCell className="hidden text-end whitespace-nowrap @md/table:table-cell">
        {pair.lastMet != null ? <Text tone="muted">{lastMetLabel(pair.lastMet)}</Text> : <NoValue />}
      </TableCell>
    </TableRow>
  );
}

/**
 * The newest matches two or more of the players shared, one row each: when and how long, then a column per player (in
 * the page's order) with their result, hero, K/D/A and souls, so every value lines up down the column. A player who
 * was not in the match leaves the cell empty; the W and L tell who was on which side.
 */
function SharedMatchesTable({
  matches,
  players,
  lastMetLabel,
}: {
  matches: readonly SharedMatch[];
  players: ComparedPlayer[];
  lastMetLabel: (unix: number) => string;
}) {
  // Only the players who appear in these matches get a column.
  const inAny = new Set(
    matches.flatMap((match) => match.teams.flatMap((team) => team.players.map((p) => p.accountId))),
  );
  const columns = players.filter((player) => inAny.has(player.accountId));
  return (
    // Not links: the site has no public match page (the tracker's scoreboard is for signed-in patrons).
    <Table density="dense" className="tabular-nums" aria-label="Recent shared matches">
      <TableHeader tone="muted">
        <TableRow>
          <TableHead data-pinned>Match</TableHead>
          {columns.map((player) => (
            <PlayerColumnHead key={player.accountId} player={player} />
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {matches.map((match) => (
          <TableRow key={match.matchId}>
            <TableCell data-pinned>
              <Text tone="muted" className="whitespace-nowrap">
                {lastMetLabel(match.startTime)}
              </Text>
              {/* The length under the day: the players' columns get the width. */}
              <Text as="div" variant="caption" tone="muted">
                {Math.round(match.durationS / 60)}m
              </Text>
            </TableCell>
            {columns.map((player) => {
              const team = match.teams.find((candidate) =>
                candidate.players.some((entry) => entry.accountId === player.accountId),
              );
              const entry = team?.players.find((candidate) => candidate.accountId === player.accountId);
              return (
                <TableCell key={player.accountId} className="text-end">
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
                      <Text tone="muted" className="w-12 shrink-0 text-end whitespace-nowrap">
                        {compactSouls(entry.netWorth)}
                        <span className="sr-only"> souls</span>
                      </Text>
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
      {/* In the header's order: together, synergy, duo heroes, against. */}
      {[0, 1].map((cell) => (
        <TableCell key={cell} className="text-end">
          <Skeleton className="ms-auto h-4 w-16" />
        </TableCell>
      ))}
      <TableCell className={DUO_COLUMN}>
        <Skeleton className="ms-auto h-4 w-24" />
      </TableCell>
      <TableCell className="text-end">
        <Skeleton className="ms-auto h-4 w-16" />
      </TableCell>
      <TableCell className="hidden text-end @md/table:table-cell">
        <Skeleton className="ms-auto h-4 w-20" />
      </TableCell>
    </TableRow>
  );
}

/**
 * Every pair of compared players: the matches they played on the same team with that team's record, the matches
 * they played against each other with the head-to-head, and when they last met; then the newest matches two or more of
 * them shared, newest first. Pairs that never met are left out. While the histories load, every
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
  const duosOf = (pair: PlayerPair) => {
    const aMatches = histories.find((history) => history.accountId === pair.a)?.matches;
    const bMatches = histories.find((history) => history.accountId === pair.b)?.matches;
    return pair.together.matches >= MIN_DUO_HEROES_MATCHES && aMatches && bMatches
      ? duoHeroPairs(aMatches, bMatches)
      : [];
  };
  // A column shows when some pair has something in it; while loading, every column holds its place.
  const columns: PairColumns = loading
    ? { synergy: true, duo: true, against: true }
    : {
        synergy: met.some((pair) => pairSynergy(pair) != null),
        duo: met.some((pair) => duosOf(pair).length > 0),
        against: met.some((pair) => pair.against.matches > 0),
      };
  const recent = recentSharedMatches(histories, 8);
  const loadingPairs = players.flatMap((a, i) => players.slice(i + 1).map((b) => [a, b] as const));

  return (
    <Panel className={className}>
      <PanelHeader size="sm" title="Together & against" />
      {failed.map((history) => {
        const player = byId.get(history.accountId);
        return player ? <HistoryError key={history.accountId} player={player} history={history} /> : null;
      })}
      {/* Nobody met: one line instead of a table of empty rows. */}
      {/* Only a verdict when every history is in: a failed one leaves its pairs unknown, not unmet. */}
      {!loading && failed.length === 0 && pairs.length > 0 && met.length === 0 && (
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
              {columns.synergy && <TableHead className="text-end">Synergy</TableHead>}
              {columns.duo && <TableHead className={DUO_COLUMN}>Duo heroes</TableHead>}
              {columns.against && <TableHead className="text-end">Against</TableHead>}
              <TableHead className="hidden text-end @md/table:table-cell">Last met</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? loadingPairs.map(([a, b]) => <PairRowSkeleton key={`${a.accountId}-${b.accountId}`} a={a} b={b} />)
              : met.map((pair) => {
                  const a = byId.get(pair.a);
                  const b = byId.get(pair.b);
                  if (!a || !b) return null;
                  return (
                    <PairRow
                      key={`${pair.a}-${pair.b}`}
                      pair={pair}
                      a={a}
                      b={b}
                      duos={duosOf(pair)}
                      columns={columns}
                      lastMetLabel={lastMetLabel}
                    />
                  );
                })}
          </TableBody>
        </Table>
      )}
      {recent.length > 0 && (
        <>
          <PanelHeader size="sm" title="Recent shared matches" />
          <SharedMatchesTable matches={recent} players={players} lastMetLabel={lastMetLabel} />
        </>
      )}
    </Panel>
  );
}
