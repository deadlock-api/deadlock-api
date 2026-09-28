import { HeroImage } from "~/components/domain/assets/HeroImage";
import { Panel, PanelHeader } from "~/components/patterns/panel/Panel";
import { NoValue } from "~/components/ui/no-value";
import { Skeleton } from "~/components/ui/skeleton";
import { Inline } from "~/components/ui/stack";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { day } from "~/dayjs";
import { BEST_HERO_MIN_MATCHES, type PlayerRecords, playerRecords, type RecordMatch } from "~/lib/compare-records";
import { statWinners } from "~/lib/player-compare";
import { formatStatValue } from "~/lib/stat-format";

import { PlayerColumnHead, RowValue } from "./CompareTableParts";
import type { ComparedPlayer } from "./types";
import type { CompareMatchHistory } from "./useCompareMatchHistories";

const integer = (value: number) => formatStatValue(value, "integer");

function formatStreak(streak: number): string {
  if (streak === 0) return "–";
  return streak > 0 ? `${streak}W` : `${-streak}L`;
}

interface RecordRow {
  key: string;
  label: string;
  /** The number the row is judged on; null when the player has none. */
  value: (records: PlayerRecords) => number | null;
  format: (value: number, records: PlayerRecords) => string;
  /** The match that set the record, shown as its hero and date. */
  match?: (records: PlayerRecords) => RecordMatch | null;
  /** The hero the row is about, shown beside the value at any width. */
  hero?: (records: PlayerRecords) => number | null;
  /** What the value stands on ("in 24 matches"), on hover and for a screen reader. */
  detail?: (records: PlayerRecords) => string;
}

const ROWS: RecordRow[] = [
  {
    key: "bestHero",
    label: `Best hero (${BEST_HERO_MIN_MATCHES}+)`,
    // Judged in the shown whole percent.
    value: (records) => (records.bestHero ? Math.round(records.bestHero.winRate * 100) : null),
    format: (value) => `${value}%`,
    hero: (records) => records.bestHero?.heroId ?? null,
    detail: (records) => (records.bestHero ? `in ${records.bestHero.matches} matches` : ""),
  },
  {
    key: "mostKills",
    label: "Most kills",
    value: (records) => records.mostKills?.value ?? null,
    format: integer,
    match: (records) => records.mostKills,
  },
  {
    key: "mostAssists",
    label: "Most assists",
    value: (records) => records.mostAssists?.value ?? null,
    format: integer,
    match: (records) => records.mostAssists,
  },
  {
    key: "mostSouls",
    label: "Most souls",
    value: (records) => records.mostSouls?.value ?? null,
    format: integer,
    match: (records) => records.mostSouls,
  },
  {
    key: "bestSoulsPerMin",
    label: "Best souls / min",
    value: (records) => (records.bestSoulsPerMin ? Math.round(records.bestSoulsPerMin.value) : null),
    format: integer,
    match: (records) => records.bestSoulsPerMin,
  },
  {
    key: "mostLastHits",
    label: "Most last hits",
    value: (records) => records.mostLastHits?.value ?? null,
    format: integer,
    match: (records) => records.mostLastHits,
  },
  {
    key: "bestKda",
    label: "Best KDA",
    // Judged in the shown tenths, so a tie as printed is a tie.
    value: (records) => (records.bestKda ? Number(records.bestKda.value.toFixed(1)) : null),
    format: (value) => value.toFixed(1),
    match: (records) => records.bestKda,
  },
  {
    key: "deathless",
    label: "Deathless matches",
    value: (records) => records.deathless,
    format: integer,
  },
  {
    key: "longestWinStreak",
    label: "Longest win streak",
    value: (records) => records.longestWinStreak,
    format: (value) => `${value}W`,
  },
  {
    key: "currentStreak",
    label: "Current streak",
    value: (records) => records.currentStreak,
    format: (value) => formatStreak(value),
  },
  {
    key: "activeDays",
    label: "Days played",
    value: (records) => records.activeDays,
    format: integer,
  },
];

/** The hero a record was set on, beside the value; the match's UTC day shows on hover and to screen readers. */
function RecordValue({
  match,
  heroId,
  detail,
  won,
  children,
}: {
  match?: RecordMatch | null;
  /** A hero the value is about (not one match's): its icon at any width, without a date. */
  heroId?: number | null;
  detail?: string;
  won: boolean;
  children: string;
}) {
  if (heroId != null) {
    return (
      <Inline gap={1.5} wrap="nowrap" justify="end" title={detail}>
        <HeroImage heroId={heroId} shape="circle" className="size-5" />
        <RowValue won={won}>{children}</RowValue>
        {detail && <span className="sr-only">{detail}</span>}
      </Inline>
    );
  }
  if (!match) return <RowValue won={won}>{children}</RowValue>;
  const date = day.unix(match.startTime).utc().format("MMM D, YYYY");
  return (
    <Inline gap={1.5} wrap="nowrap" justify="end" title={date}>
      {/* The image's alt and title name the hero. */}
      {/* A narrow table keeps the numbers and gives the hero's room to the other players' columns. */}
      <HeroImage heroId={match.heroId} shape="circle" className="hidden size-5 @xl/table:block" />
      <RowValue won={won}>{children}</RowValue>
      <span className="sr-only">on {date}</span>
    </Inline>
  );
}

/**
 * Each player's best single match (kills, assists, souls, farm), their streaks and how much they played, on the
 * page's mode and dates. The best of each row gets the crown, as in the head-to-head.
 */
export function RecordsPanel({
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
  const records = histories.map((history) =>
    history.heroMatches && history.heroMatches.length > 0 ? playerRecords(history.heroMatches) : null,
  );
  const settled = histories.every((history) => !history.isPending);
  // Nothing to show once loaded: nobody has a match on the filters (failures show in together & against).
  if (settled && records.every((record) => record === null)) return null;

  return (
    <Panel className={className}>
      <PanelHeader size="sm" title="Records" />
      <Table density="dense" height="fill" className="tabular-nums">
        <TableHeader tone="muted">
          <TableRow>
            <TableHead data-pinned>Record</TableHead>
            {players.map((player) => (
              <PlayerColumnHead key={player.accountId} player={player} />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ROWS.map((row) => {
            const values = records.map((record) => (record ? row.value(record) : null));
            const winners = statWinners(values, "higher");
            return (
              <TableRow key={row.key}>
                <TableCell data-pinned className="text-muted-foreground">
                  <span className="block max-w-24 whitespace-normal @md/table:max-w-none @md/table:whitespace-nowrap">
                    {row.label}
                  </span>
                </TableCell>
                {players.map((player, index) => {
                  const history = histories[index];
                  const record = records[index];
                  const value = values[index];
                  return (
                    <TableCell key={player.accountId} className="text-end">
                      {history?.isPending ? (
                        <Skeleton className="ms-auto h-5 w-12" />
                      ) : !record || value == null ? (
                        <NoValue />
                      ) : (
                        <RecordValue
                          match={row.match?.(record)}
                          heroId={row.hero?.(record)}
                          detail={row.detail?.(record)}
                          won={winners.includes(index)}
                        >
                          {row.format(value, record)}
                        </RecordValue>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Panel>
  );
}
