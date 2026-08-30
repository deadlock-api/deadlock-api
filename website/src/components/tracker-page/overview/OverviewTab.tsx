import type { PlayerMatchHistoryEntry, Rank } from "deadlock_api_client";
import { useMemo } from "react";

import { BadgeImage } from "~/components/BadgeImage";
import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { day } from "~/dayjs";
import {
  computeActivity,
  computeStreaks,
  formatMatchDuration,
  isWin,
  MATCH_MODE_LABELS_BY_ID,
  perHeroRows,
  rankHistoryPoints,
  recentForm,
  summarize,
} from "~/lib/tracker/compute";
import { cn } from "~/lib/utils";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";
import { ActivityChart } from "./ActivityChart";
import { RankHistoryChart } from "./RankHistoryChart";

function StatTile({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function FormDots({ form }: { form: ("win" | "loss")[] }) {
  if (form.length === 0) return null;
  return (
    <div className="flex items-center gap-1" title="Recent form, newest first">
      {form.map((result, i) => (
        <span
          // oxlint-disable-next-line react/no-array-index-key
          key={i}
          className={cn("h-3 w-1.5 rounded-full", result === "win" ? "bg-emerald-500" : "bg-primary")}
        />
      ))}
    </div>
  );
}

export function OverviewTab({
  entries,
  ranks,
  onViewAllMatches,
}: {
  entries: PlayerMatchHistoryEntry[];
  ranks: Rank[];
  onViewAllMatches: () => void;
}) {
  const summary = useMemo(() => summarize(entries), [entries]);
  const form = useMemo(() => recentForm(entries, 15), [entries]);
  const streaks = useMemo(() => computeStreaks(entries), [entries]);
  const heroRows = useMemo(() => perHeroRows(entries).slice(0, 8), [entries]);
  const rankPoints = useMemo(() => rankHistoryPoints(entries), [entries]);
  const activity = useMemo(() => computeActivity(entries), [entries]);
  const recentMatches = useMemo(() => entries.slice(0, 8), [entries]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatTile
          label="Matches"
          value={summary.matches.toLocaleString()}
          sub={`${summary.wins}W – ${summary.losses}L`}
        />
        <StatTile label="Win rate" value={`${(summary.winrate * 100).toFixed(1)}%`} sub={<FormDots form={form} />} />
        <StatTile
          label="KDA"
          value={summary.kdaRatio.toFixed(2)}
          sub={`${summary.avgKills.toFixed(1)} / ${summary.avgDeaths.toFixed(1)} / ${summary.avgAssists.toFixed(1)}`}
        />
        <StatTile label="Souls per min" value={Math.round(summary.soulsPerMin).toLocaleString()} />
        <StatTile
          label="Streak"
          value={streaks.current === 0 ? "—" : `${Math.abs(streaks.current)}${streaks.current > 0 ? "W" : "L"}`}
          sub={`best ${streaks.longestWin}W · worst ${streaks.longestLoss}L`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <RankHistoryChart points={rankPoints} />
          <ActivityChart activity={activity} />
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top heroes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {heroRows.length === 0 && <div className="text-sm text-muted-foreground">No matches yet.</div>}
              {heroRows.map((row) => (
                <div key={row.heroId} className="flex items-center gap-2.5 text-sm">
                  <HeroImage heroId={row.heroId} className="size-8 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <HeroName heroId={row.heroId} className="block text-sm font-medium" />
                    <span className="text-xs text-muted-foreground">
                      {row.matches} {row.matches === 1 ? "match" : "matches"}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium tabular-nums">{(row.winrate * 100).toFixed(0)}%</div>
                    <div className="text-xs text-muted-foreground tabular-nums">{row.kdaRatio.toFixed(2)} KDA</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Recent matches</CardTitle>
              <Button variant="ghost" size="sm" onClick={onViewAllMatches}>
                View all
              </Button>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {recentMatches.length === 0 && <div className="text-sm text-muted-foreground">No matches yet.</div>}
              {recentMatches.map((entry) => {
                const win = isWin(entry);
                return (
                  <div key={entry.match_id} className="flex items-center gap-2.5 rounded-md py-1 text-sm">
                    <span className={cn("w-4 text-center font-bold", win ? WIN_TEXT_CLASS : LOSS_TEXT_CLASS)}>
                      {win ? "W" : "L"}
                    </span>
                    <HeroImage heroId={entry.hero_id} className="size-7 rounded-full" />
                    <div className="min-w-0 flex-1">
                      <div className="whitespace-nowrap tabular-nums">
                        {entry.player_kills} / {entry.player_deaths} / {entry.player_assists}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {MATCH_MODE_LABELS_BY_ID[entry.match_mode] ?? "Unknown"} ·{" "}
                        {formatMatchDuration(entry.match_duration_s)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {entry.ranked_display_badge != null && entry.ranked_display_badge > 0 && (
                        <BadgeImage badge={entry.ranked_display_badge} ranks={ranks} className="size-6" />
                      )}
                      <span
                        className="text-xs whitespace-nowrap text-muted-foreground"
                        title={day.unix(entry.start_time).format("MMM D, YYYY HH:mm")}
                      >
                        {day.unix(entry.start_time).format("MMM D")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
