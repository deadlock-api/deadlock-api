import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import { Flame } from "lucide-react";
import { useRef, useState } from "react";

import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "~/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { Tooltip, TooltipTrigger } from "~/components/ui/tooltip";
import { day } from "~/dayjs";
import { formatMatchDuration, isWin, type TrackerSummary } from "~/lib/tracker/compute";
import {
  MIN_COMPARISON_MATCHES,
  RECENT_MATCH_WINDOWS,
  type RecentMatchComparison,
  type RecentMatchWindow,
} from "~/lib/tracker/overview";
import { cn } from "~/lib/utils";

import { PanelTooltipContent, TooltipHeader, TooltipStat, TooltipStats } from "../shared/PanelTooltipContent";
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
    <Table className="table-fixed text-[11px] @sm/stats-dialog:text-sm [&_td]:px-1 [&_td]:py-1.5 @sm/stats-dialog:[&_td]:px-2 [&_th]:h-8 [&_th]:px-1 @sm/stats-dialog:[&_th]:px-2">
      <caption className="sr-only">Recent performance compared with the previous match window</caption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col" className="w-[32%]">
            Metric
          </TableHead>
          <TableHead scope="col" className="text-right">
            Latest
          </TableHead>
          <TableHead scope="col" className="text-right">
            Previous
          </TableHead>
          <TableHead scope="col" className="text-right">
            Change
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.label}>
            <TableHead scope="row" className="whitespace-normal">
              {row.label}
            </TableHead>
            <TableCell className="text-right tabular-nums">{row.latest}</TableCell>
            <TableCell className="text-right tabular-nums">{row.previous}</TableCell>
            <TableCell className="text-right whitespace-normal">{row.change}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ResultGrid({
  entries,
  onOpenMatch,
}: {
  entries: PlayerMatchHistoryEntry[];
  onOpenMatch: (matchId: number) => void;
}) {
  const gridRef = useRef<HTMLFieldSetElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const tabIndex = Math.min(focusedIndex, entries.length - 1);
  return (
    <fieldset ref={gridRef} className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(1.5rem,1fr))] gap-0.5">
      <legend className="sr-only">Recent results, newest first. Use arrow keys to move between matches.</legend>
      {entries.map((entry, index) => (
        <Tooltip key={entry.match_id}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onOpenMatch(entry.match_id)}
              tabIndex={index === tabIndex ? 0 : -1}
              onFocus={() => setFocusedIndex(index)}
              onKeyDown={(event) => {
                if (event.altKey) return;
                const grid = gridRef.current;
                if (!grid) return;
                const buttons = [...grid.querySelectorAll<HTMLButtonElement>("button")];
                const firstRowTop = buttons[0].getBoundingClientRect().top;
                const columns = buttons.filter(
                  (button) => Math.abs(button.getBoundingClientRect().top - firstRowTop) < 1,
                ).length;
                const delta =
                  event.key === "ArrowRight"
                    ? 1
                    : event.key === "ArrowLeft"
                      ? -1
                      : event.key === "ArrowDown"
                        ? columns
                        : event.key === "ArrowUp"
                          ? -columns
                          : null;
                if (delta == null && event.key !== "Home" && event.key !== "End") return;
                event.preventDefault();
                const next = Math.max(
                  0,
                  Math.min(
                    entries.length - 1,
                    event.key === "Home" ? 0 : event.key === "End" ? entries.length - 1 : index + (delta ?? 0),
                  ),
                );
                buttons[next]?.focus();
              }}
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
          <PanelTooltipContent>
            <TooltipHeader
              lead={<HeroImage heroId={entry.hero_id} className="size-8 rounded-full" title="" />}
              title={<HeroName heroId={entry.hero_id} />}
              subtitle={day.unix(entry.start_time).format("MMM D, YYYY · HH:mm")}
            />
            <TooltipStats>
              <TooltipStat
                label="Result"
                value={isWin(entry) ? "Victory" : "Defeat"}
                className={isWin(entry) ? "text-victory" : "text-primary"}
              />
              <TooltipStat
                label="K / D / A"
                value={`${entry.player_kills} / ${entry.player_deaths} / ${entry.player_assists}`}
              />
              <TooltipStat label="Duration" value={formatMatchDuration(entry.match_duration_s)} />
            </TooltipStats>
          </PanelTooltipContent>
        </Tooltip>
      ))}
    </fieldset>
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
      dialogClassName="sm:max-w-2xl"
      icon={Flame}
      meta={meta}
      details={(close) => (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{scope}</p>
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
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border p-2">
                  <h3 className="text-xs font-semibold">Latest {recent.matches} matches</h3>
                  <p className="text-[10px] text-muted-foreground">{dateRange(entries)}</p>
                  <p className="mt-1 text-xs tabular-nums">
                    {recent.wins} wins / {recent.losses} losses
                  </p>
                </div>
                <div className="rounded-md border p-2">
                  <h3 className="text-xs font-semibold">Previous {previous.matches} matches</h3>
                  <p className="text-[10px] text-muted-foreground">{dateRange(previousEntries)}</p>
                  <p className="mt-1 text-xs tabular-nums">
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
