import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import { Flame } from "lucide-react";

import { HeroName } from "~/components/HeroName";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "~/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { day } from "~/dayjs";
import { formatMatchDuration, isWin, type TrackerSummary } from "~/lib/tracker/compute";
import {
  MIN_COMPARISON_MATCHES,
  RECENT_MATCH_WINDOWS,
  type RecentMatchComparison,
  type RecentMatchWindow,
} from "~/lib/tracker/overview";
import { cn } from "~/lib/utils";

import { OverviewDetailPanel } from "./OverviewDetailPanel";

const integer = (value: number) => Math.round(value).toLocaleString("en-US");
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const decimal = (value: number) => value.toFixed(1);
const ratio = (value: number) => value.toFixed(2);

const comparisonMetrics = [
  { key: "winrate", label: "Win rate", format: percent, precision: 1, scale: 100, unit: " pp" },
  { key: "kdaRatio", label: "KDA ratio", format: ratio, precision: 2 },
  { key: "avgKills", label: "Kills / match", format: decimal, precision: 1 },
  { key: "avgDeaths", label: "Deaths / match", format: decimal, precision: 1, lowerIsBetter: true },
  { key: "avgAssists", label: "Assists / match", format: decimal, precision: 1 },
  { key: "soulsPerMin", label: "Souls / min", format: integer, precision: 0 },
  { key: "lastHitsPerMin", label: "Last hits / min", format: ratio, precision: 2 },
] as const;

function Change({
  value,
  precision,
  unit = "",
  lowerIsBetter = false,
}: {
  value: number;
  precision: number;
  unit?: string;
  lowerIsBetter?: boolean;
}) {
  const rounded = Number(value.toFixed(precision));
  if (rounded === 0) return <span className="text-muted-foreground">No change</span>;
  const improved = lowerIsBetter ? rounded < 0 : rounded > 0;
  return (
    <span className={cn("font-medium tabular-nums", improved ? "text-victory" : "text-primary")}>
      {rounded > 0 ? "+" : ""}
      {rounded.toFixed(precision)}
      {unit}
    </span>
  );
}

function dateRange(entries: PlayerMatchHistoryEntry[]) {
  if (entries.length === 0) return "No matches";
  return `${day.unix(entries[entries.length - 1].start_time).format("MMM D, YYYY")} – ${day.unix(entries[0].start_time).format("MMM D, YYYY")}`;
}

function ComparisonMetrics({ recent, previous }: { recent: TrackerSummary; previous: TrackerSummary }) {
  const rows = comparisonMetrics.map((metric) => ({
    label: metric.label,
    latest: metric.format(recent[metric.key]),
    previous: metric.format(previous[metric.key]),
    change: (
      <Change
        value={(recent[metric.key] - previous[metric.key]) * ("scale" in metric ? metric.scale : 1)}
        precision={metric.precision}
        unit={"unit" in metric ? metric.unit : undefined}
        lowerIsBetter={"lowerIsBetter" in metric && metric.lowerIsBetter}
      />
    ),
  }));

  return (
    <>
      <dl className="flex flex-col divide-y @sm/stats-dialog:hidden">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
            <dt className="text-sm font-medium">{row.label}</dt>
            <dd className="grid grid-cols-3 gap-2 text-sm tabular-nums">
              <div>
                <span className="block text-xs text-muted-foreground">Latest</span>
                {row.latest}
              </div>
              <div>
                <span className="block text-xs text-muted-foreground">Previous</span>
                {row.previous}
              </div>
              <div className="text-right">
                <span className="block text-xs text-muted-foreground">Change</span>
                {row.change}
              </div>
            </dd>
          </div>
        ))}
      </dl>
      <div className="hidden @sm/stats-dialog:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead className="text-right">Latest</TableHead>
              <TableHead className="text-right">Previous</TableHead>
              <TableHead className="text-right">Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label}>
                <TableHead scope="row">{row.label}</TableHead>
                <TableCell className="text-right tabular-nums">{row.latest}</TableCell>
                <TableCell className="text-right tabular-nums">{row.previous}</TableCell>
                <TableCell className="text-right">{row.change}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function ResultGrid({
  entries,
  onOpenMatch,
}: {
  entries: PlayerMatchHistoryEntry[];
  onOpenMatch: (matchId: number) => void;
}) {
  return (
    <div className="@container/results">
      <fieldset className="grid min-w-0 grid-cols-5 gap-0.5 @min-[16.125rem]/results:grid-cols-10">
        <legend className="sr-only">Recent results, newest first</legend>
        {entries.map((entry) => (
          <Tooltip key={entry.match_id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onOpenMatch(entry.match_id)}
                aria-label={`Open match ${entry.match_id}, ${isWin(entry) ? "win" : "loss"}, ${day.unix(entry.start_time).format("MMM D, YYYY")}`}
                className={cn(
                  "flex h-7 items-center justify-center rounded-sm text-[10px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                  isWin(entry)
                    ? "bg-victory/15 text-victory hover:bg-victory/30"
                    : "bg-primary/15 text-primary hover:bg-primary/30",
                )}
              >
                {isWin(entry) ? "W" : "L"}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <HeroName heroId={entry.hero_id} /> · {entry.player_kills}/{entry.player_deaths}/{entry.player_assists}
              <br />
              {day.unix(entry.start_time).format("MMM D, YYYY, HH:mm")} · {formatMatchDuration(entry.match_duration_s)}
            </TooltipContent>
          </Tooltip>
        ))}
      </fieldset>
    </div>
  );
}

export function RecentFormPanel({
  comparison,
  resultFiltered,
  onWindowChange,
  onOpenMatch,
}: {
  comparison: RecentMatchComparison;
  resultFiltered: boolean;
  onWindowChange: (window: RecentMatchWindow) => void;
  onOpenMatch: (matchId: number) => void;
}) {
  const { recent, previous, streaks, entries, previousEntries, window } = comparison;
  const missing = window + MIN_COMPARISON_MATCHES - entries.length - previousEntries.length;
  const scope = resultFiltered
    ? "Includes wins and losses. Hero, mode and date filters apply."
    : "Uses the selected hero, mode and date range.";
  const meta = `Last ${recent.matches} ${recent.matches === 1 ? "match" : "matches"}`;

  return (
    <OverviewDetailPanel
      title="Recent form"
      icon={Flame}
      meta={meta}
      details={(close) => (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{scope}</p>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={String(window)}
              onValueChange={(value) => {
                const next = RECENT_MATCH_WINDOWS.find((size) => String(size) === value);
                if (next) onWindowChange(next);
              }}
              aria-label="Recent form match window"
            >
              {RECENT_MATCH_WINDOWS.map((size) => (
                <ToggleGroupItem key={size} value={String(size)} aria-label={`${size} matches`}>
                  <span>
                    {size}
                    <span className="hidden @xs/stats-dialog:inline"> matches</span>
                  </span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          {previous ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border p-3">
                  <h3 className="text-sm font-semibold">Latest {recent.matches} matches</h3>
                  <p className="text-xs text-muted-foreground">{dateRange(entries)}</p>
                  <p className="mt-2 text-sm tabular-nums">
                    {recent.wins} wins / {recent.losses} losses
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <h3 className="text-sm font-semibold">Previous {previous.matches} matches</h3>
                  <p className="text-xs text-muted-foreground">{dateRange(previousEntries)}</p>
                  <p className="mt-2 text-sm tabular-nums">
                    {previous.wins} wins / {previous.losses} losses
                  </p>
                </div>
              </div>
              <ComparisonMetrics recent={recent} previous={previous} />
              <p className="text-xs text-muted-foreground">
                Separate match windows; no match appears in both. KDA uses total kills and assists divided by total
                deaths. Per-minute stats use total time played. pp = percentage points.
                {previous.matches < window && ` The previous window has only ${previous.matches} of ${window} matches.`}
              </p>
            </>
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>More matches needed to compare</EmptyTitle>
                <EmptyDescription>
                  This window needs {missing} more {missing === 1 ? "match" : "matches"} in your selection. Comparisons
                  require {window} recent matches and at least {MIN_COMPARISON_MATCHES} earlier matches. Choose a
                  smaller window or broaden your filters.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Latest {recent.matches} results · newest first</h3>
            <ResultGrid
              entries={entries}
              onOpenMatch={(matchId) => {
                close();
                onOpenMatch(matchId);
              }}
            />
          </div>
        </div>
      )}
    >
      {resultFiltered && <p className="pb-2 text-[10px] text-muted-foreground">{scope}</p>}
      <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold text-victory tabular-nums">{percent(recent.winrate)}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {recent.wins}W / {recent.losses}L
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Current streak{" "}
          <strong className={streaks.current > 0 ? "text-victory" : "text-primary"}>
            {Math.abs(streaks.current)}
            {streaks.current > 0 ? "W" : "L"}
          </strong>
        </span>
      </div>
      <ResultGrid entries={entries.slice(0, 20)} onOpenMatch={onOpenMatch} />
      <p className="py-1 text-[10px] text-muted-foreground">
        {entries.length > 20 ? "Latest 20 results · " : ""}Newest first
      </p>
      <div className="flex flex-wrap justify-between gap-2 py-1 text-[11px] text-muted-foreground">
        <span>
          KDA <strong className="text-foreground tabular-nums">{ratio(recent.kdaRatio)}</strong>
        </span>
        <span>
          Souls / min <strong className="text-foreground tabular-nums">{integer(recent.soulsPerMin)}</strong>
        </span>
      </div>
      <p className="pt-1 text-[10px] text-muted-foreground">
        {previous ? (
          <>
            <Change value={(recent.winrate - previous.winrate) * 100} precision={1} unit=" pp" /> win rate vs. previous{" "}
            {previous.matches} matches
          </>
        ) : (
          `Comparison needs ${window + MIN_COMPARISON_MATCHES} selected matches`
        )}
      </p>
    </OverviewDetailPanel>
  );
}
