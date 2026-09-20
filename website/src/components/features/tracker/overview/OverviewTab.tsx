import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import { ArrowUpRight, ChartNoAxesCombined, Clock3, Coins, Crosshair, GitCompareArrows, Trophy } from "lucide-react";
import { parseAsNumberLiteral, useQueryState } from "nuqs";
import { useMemo } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { MODE_CONFIG } from "~/components/domain/selectors/ModeSelector";
import { HeroesTab } from "~/components/features/tracker/heroes/HeroesTab";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Heading } from "~/components/ui/heading";
import { IconTile } from "~/components/ui/icon-tile";
import { KeyValue, KeyValueList } from "~/components/ui/key-value";
import { PanelTooltip, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/panel-tooltip";
import { RateBar } from "~/components/ui/rate-bar";
import { Stat, StatGroup } from "~/components/ui/stat";
import { Text } from "~/components/ui/text";
import { day } from "~/dayjs";
import {
  computeActivity,
  computeOutcomeSplits,
  computePlaytimeHabits,
  computeRecords,
  computeSessionMomentum,
  filtersForActivityPeriod,
  formatMatchDuration,
  formatPlaytime,
  perHeroRows,
  rankHistoryPoints,
  RECORD_KINDS,
  summarize,
  type OutcomeSplit,
  type TrackerFilterValues,
} from "~/lib/tracker/compute";
import { computeInsights } from "~/lib/tracker/insights";
import { compareRecentMatches, RECENT_MATCH_WINDOWS } from "~/lib/tracker/overview";

import { CompanionsPanel } from "./CompanionsPanel";
import { HeroStatsTable } from "./HeroStatsTable";
import { PerformanceInsights } from "./PerformanceInsights";
import { PlaytimeHeatmap } from "./PlaytimeHeatmap";
import { RankBenchmarks } from "./RankBenchmarks";
import { RecentFormPanel } from "./RecentFormPanel";
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
  onFilterChange,
}: {
  entries: PlayerMatchHistoryEntry[];
  accountId: number;
  filters: TrackerFilterValues;
  latestBadge: number | null;
  onOpenMatch: (matchId: number) => void;
  onSelectHero: (heroId: number) => void;
  formEntries: PlayerMatchHistoryEntry[];
  sessionContext: PlayerMatchHistoryEntry[];
  onFilterChange: (filters: TrackerFilterValues) => void;
}) {
  const data = useMemo(() => {
    const sorted = [...entries].sort((a, b) => b.start_time - a.start_time || b.match_id - a.match_id);
    return {
      sorted,
      summary: summarize(sorted),
      heroes: perHeroRows(sorted),
      records: computeRecords(sorted),
      splits: computeOutcomeSplits(sorted, filters.mode),
      sessions: computeSessionMomentum(sorted, sessionContext),
      habits: computePlaytimeHabits(sorted),
      ranks: rankHistoryPoints(sorted),
      activity: computeActivity(sorted),
    };
  }, [entries, sessionContext, filters.mode]);
  const { sorted, summary: s, sessions, habits } = data;
  const [recentWindow, setRecentWindow] = useQueryState(
    "form_window",
    parseAsNumberLiteral(RECENT_MATCH_WINDOWS).withDefault(20),
  );
  const recent = useMemo(() => compareRecentMatches(formEntries, recentWindow), [formEntries, recentWindow]);
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
      <EmptyState
        icon={ChartNoAxesCombined}
        title="No matches to analyze"
        description="Try a different date range, hero, mode or result filter to see your performance overview."
      />
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
      value: formatPlaytime(s.totalTimeS),
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
          <IconTile size="sm" tone="primary">
            <ChartNoAxesCombined />
          </IconTile>
          <Heading as="h2" size="sm" className="tracking-tight">
            Player overview
          </Heading>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-3xs text-muted-foreground">
          <span>
            <span className="sr-only">Dates of selected matches: </span>
            {day.unix(sorted[sorted.length - 1].start_time).format("MMM D, YYYY")} –{" "}
            {day.unix(sorted[0].start_time).format("MMM D, YYYY")}
          </span>
          <Badge variant="outline">
            {filters.mode === "normal_all" ? "Ranked + unranked" : MODE_CONFIG[filters.mode].label}
          </Badge>
          {filters.heroId != null && (
            <Badge variant="outline">
              <HeroName heroId={filters.heroId} />
            </Badge>
          )}
          {filters.result !== "all" && (
            <Badge variant="outline">{filters.result === "win" ? "Wins only" : "Losses only"}</Badge>
          )}
        </div>
      </div>

      <StatGroup variant="joined" size="sm" className="grid-cols-2 @xs/overview:grid-cols-3 @3xl/overview:grid-cols-6">
        {headline.map(({ label, value, detail, accent }) => (
          <Stat key={label} label={label} value={value} sub={detail} tone={accent ? "positive" : undefined} />
        ))}
      </StatGroup>

      <div className="grid gap-2 @xl/overview:grid-cols-3">
        <Panel>
          <PanelHeader title="Combat" icon={Crosshair} size="sm">
            <Text variant="meta" tone="muted">
              Per match
            </Text>
          </PanelHeader>
          <PanelBody size="sm">
            <Card tone="muted" size="xs">
              <CardContent>
                <StatGroup variant="plain" size="sm" className="grid-cols-3">
                  <Stat label="Kills" value={decimal(s.avgKills)} align="center" />
                  <Stat label="Deaths" value={decimal(s.avgDeaths)} tone="negative" align="center" />
                  <Stat label="Assists" value={decimal(s.avgAssists)} align="center" />
                </StatGroup>
              </CardContent>
            </Card>
            <KeyValueList>
              <KeyValue
                label="Kill / death ratio"
                value={(s.avgDeaths > 0 ? s.avgKills / s.avgDeaths : s.avgKills * s.matches).toFixed(2)}
              />
              <PanelTooltip
                content={
                  <>
                    <TooltipHeader title="Takedowns / match" subtitle="Kills + assists per match" />
                    <TooltipStats>
                      <TooltipStat label="Value" value={decimal(s.avgKills + s.avgAssists)} />
                    </TooltipStats>
                  </>
                }
              >
                <KeyValue label="Takedowns / match" value={decimal(s.avgKills + s.avgAssists)} />
              </PanelTooltip>
              <KeyValue
                label="Total kills / assists"
                value={`${integer(s.avgKills * s.matches)} / ${integer(s.avgAssists * s.matches)}`}
              />
            </KeyValueList>
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Economy" icon={Coins} size="sm">
            <Text variant="meta" tone="muted">
              Per match
            </Text>
          </PanelHeader>
          <PanelBody size="sm">
            <KeyValueList>
              <KeyValue label="Souls earned" value={integer(s.avgSouls)} />
              <KeyValue label="Souls / minute" value={integer(s.soulsPerMin)} />
              <KeyValue label="Last hits" value={decimal(s.avgLastHits)} />
              <KeyValue label="Last hits / minute" value={s.lastHitsPerMin.toFixed(2)} />
              <KeyValue label="Denies" value={decimal(s.avgDenies)} />
              <KeyValue label="Total souls" value={integer(s.avgSouls * s.matches)} />
            </KeyValueList>
          </PanelBody>
        </Panel>
        <RecentFormPanel
          comparison={recent}
          resultFiltered={filters.result !== "all"}
          onWindowChange={setRecentWindow}
          onOpenMatch={onOpenMatch}
        />
      </div>

      <PerformanceInsights
        insights={insights}
        baseline={s.winrate}
        resultFiltered={filters.result !== "all"}
        onSelectHero={onSelectHero}
      />

      <RankBenchmarks key={accountId} accountId={accountId} filters={filters} latestBadge={latestBadge} />

      <TrendPanels
        entries={sorted}
        ranks={data.ranks}
        activity={data.activity}
        result={filters.result}
        onOpenMatch={onOpenMatch}
        onSelectPeriod={(bucketStartUnix, granularity) =>
          onFilterChange(filtersForActivityPeriod(filters, bucketStartUnix, granularity))
        }
      />

      <div className="grid items-start gap-2 @2xl/overview:grid-cols-2">
        <HeroStatsTable
          rows={data.heroes}
          onSelectHero={onSelectHero}
          details={({ minimumMatches, close, sort, direction }) => (
            <div className="flex flex-col gap-2">
              <HeroesTab
                result={filters.result}
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
        <CompanionsPanel accountId={accountId} filters={filters} entries={sorted} onOpenMatch={onOpenMatch} />
      </div>

      <div className="grid gap-2 @2xl/overview:grid-cols-2 @5xl/overview:grid-cols-3">
        <Panel className="@container/splits">
          <PanelHeader title="Where you win" icon={GitCompareArrows} size="sm">
            <Text variant="meta" tone="muted">
              Games / win rate
            </Text>
          </PanelHeader>
          <PanelBody size="sm" className="flex flex-col gap-2">
            <div className="grid gap-x-4 gap-y-2 @xs/splits:grid-cols-2">
              <SplitRows label="Match duration" rows={data.splits.byDuration} />
              <SplitRows label="Starting side" rows={data.splits.bySide} />
              <SplitRows label="Session momentum" rows={sessions.byPreviousResult} />
              <SplitRows label="Match in session" rows={sessions.byPosition} />
            </div>
            {(filters.result !== "all" || filters.heroId != null) && (
              <p className="text-3xs text-muted-foreground">
                Session context includes all heroes and results in this mode and date range.
              </p>
            )}
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Play habits" icon={Clock3} size="sm">
            <Text variant="meta" tone="muted">
              Your local time
            </Text>
          </PanelHeader>
          <PanelBody size="sm">
            <div className="grid grid-cols-3 gap-2 pb-2">
              {[
                { label: "Sessions", value: integer(sessions.sessions) },
                { label: "Games / session", value: decimal(sessions.avgMatchesPerSession) },
                { label: "Playtime / session", value: formatPlaytime(sessions.avgSessionTimeS) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div className="text-base font-semibold tabular-nums">{value}</div>
                  <div className="text-3xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            <PlaytimeHeatmap habits={habits} />
          </PanelBody>
        </Panel>
        <Panel className="@container/records">
          <PanelHeader title="Personal bests" icon={Trophy} size="sm">
            <Text variant="meta" tone="muted">
              In selected matches
            </Text>
          </PanelHeader>
          <PanelBody size="sm" className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-1.5 @xs/records:grid-cols-3">
              {RECORD_KINDS.map(({ key, label, format }) => {
                const record = data.records[key];
                return (
                  <Button
                    key={key}
                    variant="outline"
                    disabled={!record}
                    onClick={() => record && onOpenMatch(record.entry.match_id)}
                    className="h-auto min-w-0 flex-col items-stretch gap-0.5 px-2 py-1.5 text-start font-normal"
                  >
                    <span className="flex items-center justify-between gap-1 text-3xs text-muted-foreground">
                      {label}
                      {record && <ArrowUpRight aria-hidden="true" className="size-3 shrink-0" />}
                    </span>
                    <span className="text-base font-semibold tabular-nums">{record ? format(record.value) : "—"}</span>
                    {record ? (
                      <span className="flex min-w-0 items-center gap-1">
                        <span aria-hidden="true">
                          <HeroImage heroId={record.entry.hero_id} className="size-4" title="" />
                        </span>
                        <HeroName heroId={record.entry.hero_id} className="text-3xs text-muted-foreground" />
                      </span>
                    ) : (
                      <span className="text-3xs text-muted-foreground">Not recorded</span>
                    )}
                  </Button>
                );
              })}
            </div>
            {filters.result !== "all" && (
              <p className="text-3xs text-muted-foreground">Streaks include wins and losses.</p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted-foreground">
              <span>
                Longest win streak <strong className="text-positive tabular-nums">{streaks.longestWin}</strong>
              </span>
              <span>
                Longest loss streak <strong className="text-negative tabular-nums">{streaks.longestLoss}</strong>
              </span>
            </div>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}

function SplitRows({ label, rows }: { label: string; rows: OutcomeSplit[] }) {
  return (
    <div className="min-w-0">
      <Heading as="h4" size="eyebrow" className="pb-1">
        {label}
      </Heading>
      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 text-2xs">
            <span className="min-w-0">{row.label}</span>
            <span className="min-w-6 text-end text-muted-foreground tabular-nums">{integer(row.matches)}</span>
            <span className="min-w-7 text-end font-medium tabular-nums">
              {row.matches ? `${Math.round((row.wins / row.matches) * 100)}%` : "—"}
            </span>
            <RateBar rate={row.matches ? row.wins / row.matches : null} className="col-span-3 h-0.5" />
          </div>
        ))}
      </div>
    </div>
  );
}
