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
import { MODE_CONFIG } from "~/components/selectors/ModeSelector";
import { Badge } from "~/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "~/components/ui/empty";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { day } from "~/dayjs";
import {
  computeActivity,
  computeOutcomeSplits,
  computePlaytimeHabits,
  computeRecords,
  computeSessionMomentum,
  formatMatchDuration,
  formatPlaytime,
  isWin,
  perHeroRows,
  rankHistoryPoints,
  RECORD_KINDS,
  summarize,
  type OutcomeSplit,
  type TrackerFilterValues,
} from "~/lib/tracker/compute";
import { computeInsights } from "~/lib/tracker/insights";
import { compareRecentMatches } from "~/lib/tracker/overview";
import { cn } from "~/lib/utils";

import { HeroesTab } from "../heroes/HeroesTab";
import { CompanionsPanel } from "./CompanionsPanel";
import { DashboardPanel, MetricRows } from "./DashboardPanel";
import { HeroStatsTable } from "./HeroStatsTable";
import { PerformanceInsights } from "./PerformanceInsights";
import { PlaytimeHeatmap } from "./PlaytimeHeatmap";
import { RankBenchmarks } from "./RankBenchmarks";
import { TrendPanels } from "./TrendPanels";

const integer = (n: number) => Math.round(n).toLocaleString("en-US");
const decimal = (n: number) => n.toFixed(1);
const percent = (n: number) => `${(n * 100).toFixed(1)}%`;
const signed = (n: number) => `${n > 0 ? "+" : ""}${integer(n)}`;

export function OverviewTab({
  accountId,
  filters,
  latestBadge,
  entries,
  onOpenMatch,
  onSelectHero,
  formEntries,
  sessionContext,
}: {
  entries: PlayerMatchHistoryEntry[];
  accountId: number;
  filters: TrackerFilterValues;
  latestBadge: number | null;
  onOpenMatch: (matchId: number) => void;
  onSelectHero: (heroId: number) => void;
  formEntries: PlayerMatchHistoryEntry[];
  sessionContext: PlayerMatchHistoryEntry[];
}) {
  const data = useMemo(() => {
    const sorted = [...entries].sort((a, b) => b.start_time - a.start_time || b.match_id - a.match_id);
    return {
      sorted,
      summary: summarize(sorted),
      heroes: perHeroRows(sorted),
      records: computeRecords(sorted),
      splits: computeOutcomeSplits(sorted),
      sessions: computeSessionMomentum(sorted, sessionContext),
      habits: computePlaytimeHabits(sorted),
      ranks: rankHistoryPoints(sorted),
      activity: computeActivity(sorted),
    };
  }, [entries, sessionContext]);
  const { sorted, summary: s, sessions, habits } = data;
  const recent = useMemo(() => compareRecentMatches(formEntries), [formEntries]);
  const { streaks } = recent;
  const insights = useMemo(
    () =>
      filters.result === "all"
        ? computeInsights({
            summary: data.summary,
            heroRows: data.heroes,
            splits: data.splits,
            momentum: data.sessions,
            habits: data.habits,
          })
        : [],
    [data, filters.result],
  );

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
      label: "Rank progress",
      value: s.rankDelta == null ? "—" : signed(s.rankDelta),
      detail: s.rankDelta == null ? "No recorded rank changes" : "Recorded progress points",
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

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border @xs/overview:grid-cols-3 @3xl/overview:grid-cols-6">
        {headline.map(({ label, value, detail, accent }) => (
          <div key={label} className="flex min-w-0 flex-col gap-1 bg-card px-3 py-2">
            <dt className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">{label}</dt>
            <dd
              className={cn(
                "text-xl leading-tight font-semibold tracking-tight tabular-nums",
                accent && "text-victory",
              )}
            >
              {value}
            </dd>
            <dd className="text-[10px] text-muted-foreground">{detail}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-2 @xl/overview:grid-cols-3">
        <DashboardPanel title="Combat" icon={Crosshair} meta="Per match">
          <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/50 px-2 py-1.5">
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
          {filters.result !== "all" && (
            <p className="pb-2 text-[10px] text-muted-foreground">
              Includes wins and losses. Hero, mode and date filters apply.
            </p>
          )}
          <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold text-victory tabular-nums">{percent(recent.recent.winrate)}</span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {recent.recent.wins}W / {recent.recent.losses}L
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
          <div className="flex flex-wrap justify-between gap-2 py-1 text-[11px] text-muted-foreground">
            <span>
              KDA <strong className="text-foreground tabular-nums">{recent.recent.kdaRatio.toFixed(2)}</strong>
            </span>
            <span>
              Souls / min <strong className="text-foreground tabular-nums">{integer(recent.recent.soulsPerMin)}</strong>
            </span>
          </div>
          <p className="pt-1 text-[10px] text-muted-foreground">
            {recent.previous
              ? `${signed((recent.recent.winrate - recent.previous.winrate) * 100)} pp win rate vs. previous ${recent.previous.matches} matches`
              : "Win-rate comparison available after 25 matches"}
          </p>
        </DashboardPanel>
      </div>

      <PerformanceInsights
        insights={insights}
        baseline={s.winrate}
        resultFiltered={filters.result !== "all"}
        onSelectHero={onSelectHero}
      />

      <RankBenchmarks key={accountId} accountId={accountId} filters={filters} latestBadge={latestBadge} />

      <TrendPanels entries={sorted} ranks={data.ranks} activity={data.activity} />

      <div className="grid items-start gap-2 @2xl/overview:grid-cols-2">
        <HeroStatsTable
          rows={data.heroes}
          onSelectHero={onSelectHero}
          details={({ minimumMatches, close, sort, direction }) => (
            <div className="flex flex-col gap-2">
              {filters.result !== "all" && (
                <p className="text-xs text-muted-foreground">
                  Detailed hero stats include both wins and losses. Hero, mode and date filters still apply.
                </p>
              )}
              <HeroesTab
                minimumMatches={minimumMatches}
                initialSortKey={sort === "kdaRatio" ? "kda" : sort}
                initialSortDir={direction === "descending" ? "desc" : "asc"}
                accountId={accountId}
                gameMode={MODE_CONFIG[filters.mode].gameMode}
                matchMode={MODE_CONFIG[filters.mode].matchMode}
                heroId={filters.heroId}
                minUnixTimestamp={filters.minUnixTimestamp}
                maxUnixTimestamp={filters.maxUnixTimestamp}
                entries={formEntries}
                onSelectHero={(heroId) => {
                  onSelectHero(heroId);
                  close();
                }}
              />
            </div>
          )}
        />
        <CompanionsPanel accountId={accountId} filters={filters} entries={sorted} />
      </div>

      <div className="grid gap-2 @2xl/overview:grid-cols-2 @5xl/overview:grid-cols-3">
        <DashboardPanel
          title="Where you win"
          icon={GitCompareArrows}
          meta="Games / win rate"
          className="@container/splits"
        >
          <div className="grid gap-x-4 gap-y-2 @xs/splits:grid-cols-2">
            <SplitRows label="Match duration" rows={data.splits.byDuration} />
            <SplitRows label="Starting side" rows={data.splits.bySide} />
            <SplitRows label="Session momentum" rows={sessions.byPreviousResult} />
            <SplitRows label="Match in session" rows={sessions.byPosition} />
          </div>
          {(filters.result !== "all" || filters.heroId != null) && (
            <p className="mt-2 text-[10px] text-muted-foreground">
              Session context includes all heroes and results in this mode and date range.
            </p>
          )}
        </DashboardPanel>
        <DashboardPanel title="Play habits" icon={Clock3} meta="Your local time">
          <div className="grid grid-cols-3 gap-2 pb-2">
            {[
              { label: "Sessions", value: integer(sessions.sessions) },
              { label: "Games / session", value: decimal(sessions.avgMatchesPerSession) },
              { label: "Playtime / session", value: formatPlaytime(sessions.avgSessionTimeS) },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-base font-semibold tabular-nums">{value}</div>
                <div className="text-[10px] text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
          <PlaytimeHeatmap habits={habits} />
        </DashboardPanel>
        <DashboardPanel title="Personal bests" icon={Trophy} meta="In selected matches" className="@container/records">
          <div className="grid grid-cols-2 gap-1.5 @xs/records:grid-cols-3">
            {RECORD_KINDS.map(({ key, label, format }) => {
              const record = data.records[key];
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!record}
                  onClick={() => record && onOpenMatch(record.entry.match_id)}
                  className="group flex min-w-0 flex-col gap-0.5 rounded-md border border-border/70 px-2 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring enabled:hover:bg-accent disabled:cursor-default"
                >
                  <span className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
                    {label}
                    {record && <ArrowUpRight aria-hidden="true" className="size-3 shrink-0" />}
                  </span>
                  <span className="text-base font-semibold tabular-nums">{record ? format(record.value) : "—"}</span>
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
          {filters.result !== "all" && (
            <p className="mt-2 text-[10px] text-muted-foreground">Streaks include wins and losses.</p>
          )}
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
      <div className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-1 text-[11px]"
          >
            <span className="min-w-0">{row.label}</span>
            <span className="min-w-6 text-right text-muted-foreground tabular-nums">{integer(row.matches)}</span>
            <span className="min-w-7 text-right font-medium tabular-nums">
              {row.matches ? `${Math.round((row.wins / row.matches) * 100)}%` : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
