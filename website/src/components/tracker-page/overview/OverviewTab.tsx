import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import type { ReactNode } from "react";
import { useMemo } from "react";

import {
  computeActivity,
  computeOutcomeSplits,
  computePerformanceTrend,
  computePlaytimeHabits,
  computeRecentTrend,
  computeRecords,
  computeSessionMomentum,
  computeStreaks,
  perHeroRows,
  performanceWindow,
  rankHistoryPoints,
  recentForm,
  recentFormByHero,
  summarize,
} from "~/lib/tracker/compute";
import { computeInsights } from "~/lib/tracker/insights";

import { ActivityChart } from "./ActivityChart";
import { FormStrip } from "./FormStrip";
import { InsightsCard } from "./InsightsCard";
import { PerformanceTrendChart } from "./PerformanceTrendChart";
import { PersonalBestsCard } from "./PersonalBestsCard";
import { PlaytimeHeatmap } from "./PlaytimeHeatmap";
import { RankHistoryChart } from "./RankHistoryChart";
import { SplitsCard } from "./SplitsCard";
import { TopHeroesCard } from "./TopHeroesCard";

const TOP_HERO_COUNT = 8;
const HERO_FORM_COUNT = 5;
const FORM_COUNT = 15;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}

/** The match list's home pane: how the player is doing, what is driving it, and which heroes carry it. */
export function OverviewTab({
  entries,
  onOpenMatch,
  onSelectHero,
}: {
  entries: PlayerMatchHistoryEntry[];
  /** Opens a match in the pane beside the list. */
  onOpenMatch: (matchId: number) => void;
  /** Narrows the filters to one hero. */
  onSelectHero: (heroId: number) => void;
}) {
  const summary = useMemo(() => summarize(entries), [entries]);
  const form = useMemo(() => recentForm(entries, FORM_COUNT), [entries]);
  const streaks = useMemo(() => computeStreaks(entries), [entries]);
  const trend = useMemo(() => computeRecentTrend(entries), [entries]);
  const heroRows = useMemo(() => perHeroRows(entries), [entries]);
  const heroForm = useMemo(() => recentFormByHero(entries, HERO_FORM_COUNT), [entries]);
  const rankPoints = useMemo(() => rankHistoryPoints(entries), [entries]);
  const activity = useMemo(() => computeActivity(entries), [entries]);
  const trendWindow = performanceWindow(entries.length);
  const performance = useMemo(() => computePerformanceTrend(entries, trendWindow), [entries, trendWindow]);
  const records = useMemo(() => computeRecords(entries), [entries]);
  const habits = useMemo(() => computePlaytimeHabits(entries), [entries]);
  const splits = useMemo(() => computeOutcomeSplits(entries), [entries]);
  const momentum = useMemo(() => computeSessionMomentum(entries), [entries]);
  const insights = useMemo(
    () => computeInsights({ summary, heroRows, splits, momentum, habits }),
    [summary, heroRows, splits, momentum, habits],
  );

  return (
    <div className="@container/overview space-y-6">
      <FormStrip summary={summary} form={form} streaks={streaks} trend={trend} momentum={momentum} />

      <Section title="Progress">
        <div className="space-y-4">
          <RankHistoryChart points={rankPoints} />
          <div className="grid gap-4 @4xl/overview:grid-cols-2">
            <PerformanceTrendChart points={performance} window={trendWindow} summary={summary} />
            <ActivityChart activity={activity} />
          </div>
        </div>
      </Section>

      <Section title="What stands out">
        <div className="grid gap-4 @2xl/overview:grid-cols-2 @4xl/overview:grid-cols-3">
          <InsightsCard insights={insights} />
          <SplitsCard splits={splits} momentum={momentum} overallWinrate={summary.winrate} />
          <PlaytimeHeatmap habits={habits} />
        </div>
      </Section>

      <Section title="Highlights">
        <div className="grid gap-4 @3xl/overview:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <TopHeroesCard rows={heroRows.slice(0, TOP_HERO_COUNT)} formByHero={heroForm} onSelectHero={onSelectHero} />
          <PersonalBestsCard records={records} onOpenMatch={onOpenMatch} />
        </div>
      </Section>
    </div>
  );
}
