import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import {
  ArrowUpRight,
  ChartNoAxesCombined,
  Clock3,
  Coins,
  Crosshair,
  Flame,
  GitCompareArrows,
  Trophy,
} from "lucide-react";
import { useMemo } from "react";

import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { Badge } from "~/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "~/components/ui/empty";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { day } from "~/dayjs";
import {
  computeActivity,
  computeOutcomeSplits,
  computePerformanceTrend,
  computePlaytimeHabits,
  computeRecords,
  computeSessionMomentum,
  computeStreaks,
  formatMatchDuration,
  formatPlaytime,
  isWin,
  perHeroRows,
  performanceWindow,
  rankHistoryPoints,
  RECORD_KINDS,
  summarize,
  type OutcomeSplit,
  type TrackerFilterValues,
} from "~/lib/tracker/compute";
import { compareRecentMatches } from "~/lib/tracker/overview";
import { cn } from "~/lib/utils";

import { DashboardPanel, MetricRows, RateBar } from "./DashboardPanel";
import { HeroStatsTable } from "./HeroStatsTable";
import { RankBenchmarks } from "./RankBenchmarks";
import { TrendPanels } from "./TrendPanels";

const integer = (n: number) => Math.round(n).toLocaleString("en-US");
const decimal = (n: number) => n.toFixed(1);
const percent = (n: number) => `${(n * 100).toFixed(1)}%`;
const signed = (n: number) => `${n > 0 ? "+" : ""}${integer(n)}`;
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function OverviewTab({
  accountId,
  filters,
  latestBadge,
  entries,
  onOpenMatch,
  onSelectHero,
}: {
  entries: PlayerMatchHistoryEntry[];
  accountId: number;
  filters: TrackerFilterValues;
  latestBadge: number | null;
  onOpenMatch: (matchId: number) => void;
  onSelectHero: (heroId: number) => void;
}) {
  const data = useMemo(() => {
    const sorted = [...entries].sort((a, b) => b.start_time - a.start_time || b.match_id - a.match_id);
    const window = performanceWindow(sorted.length);
    return {
      sorted,
      window,
      summary: summarize(sorted),
      heroes: perHeroRows(sorted),
      recent: compareRecentMatches(sorted),
      streaks: computeStreaks(sorted),
      records: computeRecords(sorted),
      splits: computeOutcomeSplits(sorted),
      sessions: computeSessionMomentum(sorted),
      habits: computePlaytimeHabits(sorted),
      performance: computePerformanceTrend(sorted, window),
      ranks: rankHistoryPoints(sorted),
      activity: computeActivity(sorted),
    };
  }, [entries]);
  const { sorted, summary: s, recent, streaks, sessions, habits } = data;

  if (sorted.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ChartNoAxesCombined />
          </EmptyMedia>
          <EmptyTitle>No matches to analyze</EmptyTitle>
          <EmptyDescription>
            Try a different date range, hero, mode or result filter to see your performance overview.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  const headline = [
    { label: "Matches", value: integer(s.matches), detail: `${integer(s.wins)}W / ${integer(s.losses)}L` },
    {
      label: "Win rate",
      value: percent(s.winrate),
      detail: `${signed(s.wins - s.losses)} win / loss balance`,
      accent: true,
    },
    { label: "KDA ratio", value: s.kdaRatio.toFixed(2), detail: "(kills + assists) / deaths" },
    { label: "Souls / min", value: integer(s.soulsPerMin), detail: `${integer(s.avgSouls)} avg. souls` },
    {
      label: "Playtime",
      value: `${integer(s.totalTimeS / 3600)}h`,
      detail: `${formatMatchDuration(s.avgDurationS)} avg. match`,
    },
    {
      label: "Rank change",
      value: s.rankDelta == null ? "—" : signed(s.rankDelta),
      detail: s.rankDelta == null ? "No recorded rank changes" : "Total recorded progress",
    },
  ];

  return (
    <div className="@container/overview flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <ChartNoAxesCombined className="size-4" aria-hidden="true" />
          </span>
          <h2 className="text-sm font-semibold tracking-tight">Player overview</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <span>
            {day.unix(sorted[sorted.length - 1].start_time).format("MMM D, YYYY")} –{" "}
            {day.unix(sorted[0].start_time).format("MMM D, YYYY")}
          </span>
          <Badge variant="outline">Filtered matches</Badge>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border @md/overview:grid-cols-3 @3xl/overview:grid-cols-6">
        {headline.map(({ label, value, detail, accent }) => (
          <div key={label} className="flex min-w-0 flex-col gap-1 bg-card px-3 py-3">
            <dt className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">{label}</dt>
            <dd
              className={cn(
                "text-2xl leading-tight font-semibold tracking-tight tabular-nums",
                accent && "text-victory",
              )}
            >
              {value}
            </dd>
            <span className="text-[10px] text-muted-foreground">{detail}</span>
          </div>
        ))}
      </dl>

      <div className="grid gap-2 @xl/overview:grid-cols-3">
        <DashboardPanel title="Combat" icon={Crosshair} meta="Per match">
          <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/50 px-2 py-2">
            {[
              { label: "Kills", value: s.avgKills, color: "text-foreground" },
              { label: "Deaths", value: s.avgDeaths, color: "text-primary" },
              { label: "Assists", value: s.avgAssists, color: "text-foreground" },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <div className={cn("text-lg font-semibold tabular-nums", color)}>{decimal(value)}</div>
                <div className="text-[10px] text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
          <MetricRows
            rows={[
              {
                label: "Kill / death ratio",
                value: (s.avgDeaths > 0 ? s.avgKills / s.avgDeaths : s.avgKills * s.matches).toFixed(2),
              },
              {
                label: "Takedowns / match",
                value: decimal(s.avgKills + s.avgAssists),
                hint: "Kills + assists per match",
              },
              {
                label: "Total kills / assists",
                value: `${integer(s.avgKills * s.matches)} / ${integer(s.avgAssists * s.matches)}`,
              },
            ]}
          />
        </DashboardPanel>
        <DashboardPanel title="Economy" icon={Coins} meta="Per match">
          <MetricRows
            rows={[
              { label: "Souls earned", value: integer(s.avgSouls) },
              { label: "Souls / minute", value: integer(s.soulsPerMin) },
              { label: "Last hits", value: decimal(s.avgLastHits) },
              { label: "Last hits / minute", value: s.lastHitsPerMin.toFixed(2) },
              { label: "Denies", value: decimal(s.avgDenies) },
              { label: "Total souls", value: integer(s.avgSouls * s.matches) },
            ]}
          />
        </DashboardPanel>
        <DashboardPanel title="Recent form" icon={Flame} meta={`Last ${recent.recent.matches} matches`}>
          <div className="flex items-baseline gap-2 pb-2">
            <span className="text-xl font-semibold text-victory tabular-nums">{percent(recent.recent.winrate)}</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {recent.recent.wins}W / {recent.recent.losses}L
            </span>
          </div>
          <div className="grid grid-cols-10 gap-1" aria-label="Recent results, newest first">
            {recent.entries.map((entry) => (
              <Tooltip key={entry.match_id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onOpenMatch(entry.match_id)}
                    aria-label={`Open match ${entry.match_id}, ${isWin(entry) ? "win" : "loss"}`}
                    className={cn(
                      "flex h-6 items-center justify-center rounded-sm text-[9px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                      isWin(entry)
                        ? "bg-victory/15 text-victory hover:bg-victory/30"
                        : "bg-primary/15 text-primary hover:bg-primary/30",
                    )}
                  >
                    {isWin(entry) ? "W" : "L"}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <HeroName heroId={entry.hero_id} /> · {entry.player_kills}/{entry.player_deaths}/
                  {entry.player_assists} · {day.unix(entry.start_time).format("MMM D, HH:mm")}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
          <div className="flex justify-between py-1 text-[9px] text-muted-foreground">
            <span>Newest</span>
            <span>Oldest</span>
          </div>
          <MetricRows
            rows={[
              {
                label: "Current streak",
                value: (
                  <span className={streaks.current > 0 ? "text-victory" : "text-primary"}>
                    {Math.abs(streaks.current)}
                    {streaks.current > 0 ? " wins" : " losses"}
                  </span>
                ),
              },
              {
                label: "Recent KDA / SPM",
                value: `${recent.recent.kdaRatio.toFixed(2)} / ${integer(recent.recent.soulsPerMin)}`,
              },
            ]}
          />
          <p className="pt-1 text-[10px] text-muted-foreground">
            {recent.previous
              ? `${signed((recent.recent.winrate - recent.previous.winrate) * 100)} pp win rate vs. previous ${recent.previous.matches} matches`
              : "Win-rate comparison available after 25 matches"}
          </p>
        </DashboardPanel>
      </div>

      <RankBenchmarks key={accountId} accountId={accountId} filters={filters} latestBadge={latestBadge} />

      <TrendPanels performance={data.performance} window={data.window} ranks={data.ranks} activity={data.activity} />

      <div className="grid items-start gap-2 @2xl/overview:grid-cols-2">
        <HeroStatsTable rows={data.heroes} onSelectHero={onSelectHero} />
        <DashboardPanel title="Where you win" icon={GitCompareArrows} meta="Games / win rate">
          <div className="grid gap-x-5 gap-y-3 @4xl/overview:grid-cols-2">
            <SplitRows label="Match duration" rows={data.splits.byDuration} />
            <SplitRows label="Starting side" rows={data.splits.bySide} />
            <SplitRows label="Session momentum" rows={sessions.byPreviousResult} />
            <SplitRows label="Match in session" rows={sessions.byPosition} />
          </div>
        </DashboardPanel>
      </div>

      <div className="grid gap-2 @2xl/overview:grid-cols-2">
        <DashboardPanel title="Play habits" icon={Clock3} meta="Your local time">
          <div className="grid grid-cols-3 gap-2 pb-3">
            {[
              { label: "Sessions", value: integer(sessions.sessions) },
              { label: "Games / session", value: decimal(sessions.avgMatchesPerSession) },
              { label: "Avg. session", value: formatPlaytime(sessions.avgSessionTimeS) },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-base font-semibold tabular-nums">{value}</div>
                <div className="text-[10px] text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
          <div
            className="grid grid-cols-[1.75rem_repeat(12,minmax(0,1fr))] gap-1"
            aria-label="Matches by weekday and two-hour window"
          >
            <span />
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i * 2} className="text-center text-[9px] text-muted-foreground">
                {i * 2}
              </span>
            ))}
            {weekdays.map((weekday, index) => (
              <HeatmapRow
                key={weekday}
                weekday={weekday}
                cells={habits.cells.filter((c) => c.weekday === index)}
                max={habits.maxMatches}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-1 text-[10px] text-muted-foreground">
            <span>
              {habits.favoriteWeekday ? `Most active: ${weekdays[habits.favoriteWeekday.weekday]}` : "No activity"}
              {habits.peakHourStart != null &&
                ` · Peak: ${habits.peakHourStart}:00–${(habits.peakHourStart + 3) % 24}:00`}
            </span>
            <span>Fainter → fewer games</span>
          </div>
        </DashboardPanel>
        <DashboardPanel title="Personal bests" icon={Trophy} meta="In selected matches">
          <div className="grid grid-cols-2 gap-1.5 @lg/overview:grid-cols-3">
            {RECORD_KINDS.map(({ key, label, format }) => {
              const record = data.records[key];
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!record}
                  onClick={() => record && onOpenMatch(record.entry.match_id)}
                  className="group flex min-w-0 flex-col gap-1 rounded-md border border-border/70 px-2 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring enabled:hover:bg-accent disabled:cursor-default"
                >
                  <span className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
                    {label}
                    {record && <ArrowUpRight aria-hidden="true" className="size-3 shrink-0" />}
                  </span>
                  <span className="text-lg font-semibold tabular-nums">{record ? format(record.value) : "—"}</span>
                  {record ? (
                    <span className="flex min-w-0 items-center gap-1">
                      <span aria-hidden="true">
                        <HeroImage heroId={record.entry.hero_id} className="size-4" />
                      </span>
                      <HeroName heroId={record.entry.hero_id} className="text-[10px] text-muted-foreground" />
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">Not recorded</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span>
              Longest win streak <strong className="text-victory tabular-nums">{streaks.longestWin}</strong>
            </span>
            <span>
              Longest loss streak <strong className="text-primary tabular-nums">{streaks.longestLoss}</strong>
            </span>
          </div>
        </DashboardPanel>
      </div>
    </div>
  );
}

function SplitRows({ label, rows }: { label: string; rows: OutcomeSplit[] }) {
  return (
    <div className="min-w-0">
      <h4 className="pb-1 text-[9px] font-medium tracking-wider text-muted-foreground uppercase">{label}</h4>
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-1 text-[11px]"
          >
            <span className="min-w-0 truncate" title={row.label}>
              {row.label}
            </span>
            <span className="w-7 text-right text-muted-foreground tabular-nums">{integer(row.matches)}</span>
            <span className="w-9 text-right font-medium tabular-nums">
              {row.matches ? `${Math.round((row.wins / row.matches) * 100)}%` : "—"}
            </span>
            <div className="col-span-3">
              <RateBar wins={row.wins} matches={row.matches} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeatmapRow({
  weekday,
  cells,
  max,
}: {
  weekday: string;
  cells: { hour: number; matches: number; wins: number }[];
  max: number;
}) {
  return (
    <>
      <span className="text-[9px] text-muted-foreground">{weekday}</span>
      {cells.map((cell) => (
        <Tooltip key={cell.hour}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`${weekday} ${cell.hour}:00–${cell.hour + 2}:00: ${cell.matches} matches, ${cell.wins} wins`}
              className="h-3.5 rounded-xs bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              style={
                cell.matches
                  ? {
                      backgroundColor: `color-mix(in srgb, var(--victory) ${20 + (cell.matches / max) * 80}%, var(--muted))`,
                    }
                  : undefined
              }
            />
          </TooltipTrigger>
          <TooltipContent>
            {weekday} {cell.hour}:00–{cell.hour + 2}:00 · {cell.matches} matches
            {cell.matches > 0 ? ` · ${percent(cell.wins / cell.matches)} wins` : ""}
          </TooltipContent>
        </Tooltip>
      ))}
    </>
  );
}
