import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import { Flame } from "lucide-react";
import { useRef, useState } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { PanelWithDetails } from "~/components/patterns/panel/PanelWithDetails";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Delta } from "~/components/ui/delta";
import { Heading } from "~/components/ui/heading";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { Tooltip } from "~/components/ui/tooltip";
import { day } from "~/dayjs";
import { TONE_TEXT } from "~/lib/tone";
import { formatMatchDuration, isWin, type TrackerSummary } from "~/lib/tracker/compute";
import {
  MIN_COMPARISON_MATCHES,
  RECENT_MATCH_WINDOWS,
  type RecentMatchComparison,
  type RecentMatchWindow,
} from "~/lib/tracker/overview";

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
  unit,
  lowerIsBetter = false,
}: {
  value: number;
  precision: number;
  unit?: string;
  lowerIsBetter?: boolean;
}) {
  if (Number(value.toFixed(precision)) === 0) return <span className="text-muted-foreground">No change</span>;
  return <Delta value={value} format="number" digits={precision} unit={unit} invert={lowerIsBetter} />;
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
    <Table density="dense" className="table-fixed @sm/stats-dialog:text-sm">
      <caption className="sr-only">Recent performance compared with the previous match window</caption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col" className="w-1/3">
            Metric
          </TableHead>
          <TableHead scope="col" className="text-end">
            Latest
          </TableHead>
          <TableHead scope="col" className="text-end">
            Previous
          </TableHead>
          <TableHead scope="col" className="text-end">
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
            <TableCell className="text-end tabular-nums">{row.latest}</TableCell>
            <TableCell className="text-end tabular-nums">{row.previous}</TableCell>
            <TableCell className="text-end whitespace-normal">{row.change}</TableCell>
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
        <Tooltip
          key={entry.match_id}
          content={
            <>
              <TooltipHeader
                leading={<HeroImage heroId={entry.hero_id} shape="circle" title="" />}
                title={<HeroName heroId={entry.hero_id} />}
                subtitle={day.unix(entry.start_time).format("MMM D, YYYY · HH:mm")}
              />
              <TooltipStats>
                <TooltipStat
                  label="Result"
                  value={isWin(entry) ? "Victory" : "Defeat"}
                  className={TONE_TEXT[isWin(entry) ? "positive" : "negative"]}
                />
                <TooltipStat
                  label="K / D / A"
                  value={`${entry.player_kills} / ${entry.player_deaths} / ${entry.player_assists}`}
                />
                <TooltipStat label="Duration" value={formatMatchDuration(entry.match_duration_s)} />
              </TooltipStats>
            </>
          }
        >
          <Button
            variant={isWin(entry) ? "positive-soft" : "negative-soft"}
            size="xs"
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
            className="w-full px-0 font-semibold"
          >
            {isWin(entry) ? "W" : "L"}
          </Button>
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
  const [open, setOpen] = useState(false);

  return (
    <PanelWithDetails
      title="Recent form"
      dialogSize="default"
      icon={Flame}
      description={meta}
      open={open}
      onOpenChange={setOpen}
      details={
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{scope}</p>
            <Segmented
              size="sm"
              width="hug"
              value={String(window)}
              onValueChange={(value) => {
                const next = RECENT_MATCH_WINDOWS.find((size) => String(size) === value);
                if (next) onWindowChange(next);
              }}
              aria-label="Recent form match window"
            >
              {RECENT_MATCH_WINDOWS.map((size) => (
                <SegmentedItem key={size} value={String(size)} aria-label={`${size} matches`}>
                  <span>
                    {size}
                    <span className="hidden @xs/stats-dialog:inline"> matches</span>
                  </span>
                </SegmentedItem>
              ))}
            </Segmented>
          </div>
          {previous ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Card tone="inset" size="xs" className="gap-0 px-2">
                  <Heading as="h3" size="xs">
                    Latest {recent.matches} matches
                  </Heading>
                  <p className="text-3xs text-muted-foreground">{dateRange(entries)}</p>
                  <p className="pt-1 text-xs tabular-nums">
                    {recent.wins} wins / {recent.losses} losses
                  </p>
                </Card>
                <Card tone="inset" size="xs" className="gap-0 px-2">
                  <Heading as="h3" size="xs">
                    Previous {previous.matches} matches
                  </Heading>
                  <p className="text-3xs text-muted-foreground">{dateRange(previousEntries)}</p>
                  <p className="pt-1 text-xs tabular-nums">
                    {previous.wins} wins / {previous.losses} losses
                  </p>
                </Card>
              </div>
              <ComparisonMetrics recent={recent} previous={previous} />
              <p className="text-xs text-muted-foreground">
                Separate match windows; no match appears in both. KDA uses total kills and assists divided by total
                deaths. Per-minute stats use total time played. pp = percentage points.
                {previous.matches < window && ` The previous window has only ${previous.matches} of ${window} matches.`}
              </p>
            </>
          ) : (
            <EmptyState
              title="More matches needed to compare"
              description={`This window needs ${missing} more ${missing === 1 ? "match" : "matches"} in your selection. Comparisons require ${window} recent matches and at least ${MIN_COMPARISON_MATCHES} earlier matches. Choose a smaller window or broaden your filters.`}
            />
          )}
          <div className="flex flex-col gap-2">
            <Heading as="h3" size="sm">
              Latest {recent.matches} results · newest first
            </Heading>
            <ResultGrid
              entries={entries}
              onOpenMatch={(matchId) => {
                setOpen(false);
                onOpenMatch(matchId);
              }}
            />
          </div>
        </div>
      }
    >
      <div>
        {resultFiltered && <p className="pb-2 text-3xs text-muted-foreground">{scope}</p>}
        <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold text-positive tabular-nums">{percent(recent.winrate)}</span>
            <span className="text-2xs text-muted-foreground tabular-nums">
              {recent.wins}W / {recent.losses}L
            </span>
          </div>
          <span className="text-2xs text-muted-foreground">
            Current streak{" "}
            <strong className={TONE_TEXT[streaks.current > 0 ? "positive" : "negative"]}>
              {Math.abs(streaks.current)}
              {streaks.current > 0 ? "W" : "L"}
            </strong>
          </span>
        </div>
        <ResultGrid entries={entries.slice(0, 20)} onOpenMatch={onOpenMatch} />
        <p className="py-1 text-3xs text-muted-foreground">
          {entries.length > 20 ? "Latest 20 results · " : ""}Newest first
        </p>
        <div className="flex flex-wrap justify-between gap-2 py-1 text-2xs text-muted-foreground">
          <span>
            KDA <strong className="text-foreground tabular-nums">{ratio(recent.kdaRatio)}</strong>
          </span>
          <span>
            Souls / min <strong className="text-foreground tabular-nums">{integer(recent.soulsPerMin)}</strong>
          </span>
        </div>
        <p className="pt-1 text-3xs text-muted-foreground">
          {previous ? (
            <>
              <Change value={(recent.winrate - previous.winrate) * 100} precision={1} unit=" pp" /> win rate vs.
              previous {previous.matches} matches
            </>
          ) : (
            `Comparison needs ${window + MIN_COMPARISON_MATCHES} selected matches`
          )}
        </p>
      </div>
    </PanelWithDetails>
  );
}
