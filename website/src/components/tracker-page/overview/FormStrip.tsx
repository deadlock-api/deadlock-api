import type { ReactNode } from "react";

import { Card } from "~/components/ui/card";
import {
  type FormResult,
  formatPlaytime,
  type RecentTrend,
  type SessionMomentum,
  type StreakInfo,
  type TrackerSummary,
} from "~/lib/tracker/compute";
import { cn } from "~/lib/utils";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";
import { FormDots } from "../shared/FormDots";

function Segment({
  label,
  value,
  sub,
  subTitle,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  subTitle?: string;
}) {
  return (
    <div className="border-t border-l border-border px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex h-8 items-center gap-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums" title={subTitle}>
        {sub}
      </div>
    </div>
  );
}

function TrendChip({ trend }: { trend: RecentTrend }) {
  const flat = trend.deltaPoints === 0;
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-xs font-medium",
        flat
          ? "bg-muted text-muted-foreground"
          : trend.deltaPoints > 0
            ? cn("bg-emerald-500/10", WIN_TEXT_CLASS)
            : cn("bg-primary/10", LOSS_TEXT_CLASS),
      )}
      title={`Last ${trend.window} matches against every match before them`}
    >
      {flat ? "±0" : `${trend.deltaPoints > 0 ? "+" : "−"}${Math.abs(trend.deltaPoints)}`}
    </span>
  );
}

export function FormStrip({
  summary,
  form,
  streaks,
  trend,
  momentum,
}: {
  summary: TrackerSummary;
  form: FormResult[];
  streaks: StreakInfo;
  trend: RecentTrend | null;
  momentum: SessionMomentum;
}) {
  return (
    // Every segment draws its own top and left hairline; the offset grid hides the outer ones behind
    // the card's own border, so the separators land correctly however the segments wrap.
    <Card className="overflow-hidden py-0">
      <div className="-mt-px -ml-px grid grid-cols-2 @2xl/overview:grid-cols-3 @5xl/overview:grid-cols-5">
        <Segment
          label="Win rate"
          value={
            <>
              {(summary.winrate * 100).toFixed(1)}%{trend && <TrendChip trend={trend} />}
            </>
          }
          sub={`${summary.wins.toLocaleString("en-US")}W – ${summary.losses.toLocaleString("en-US")}L`}
        />
        <Segment
          label="Recent form"
          value={form.length > 0 ? <FormDots form={form} /> : <span className="text-muted-foreground">—</span>}
          sub={
            streaks.current === 0
              ? "No matches yet"
              : `${Math.abs(streaks.current)}${streaks.current > 0 ? "W" : "L"} streak · best ${streaks.longestWin}W · worst ${streaks.longestLoss}L`
          }
        />
        <Segment
          label="KDA"
          value={summary.kdaRatio.toFixed(2)}
          sub={`${summary.avgKills.toFixed(1)} / ${summary.avgDeaths.toFixed(1)} / ${summary.avgAssists.toFixed(1)} per match`}
        />
        <Segment
          label="Souls per min"
          value={Math.round(summary.soulsPerMin).toLocaleString("en-US")}
          sub={`${Math.round(summary.avgSouls / 1000)}k per match`}
        />
        <Segment
          label="Matches / session"
          value={momentum.avgMatchesPerSession.toFixed(1)}
          sub={
            momentum.sessions === 0
              ? "No sessions yet"
              : `${momentum.sessions.toLocaleString("en-US")} sessions · ${formatPlaytime(momentum.avgSessionTimeS)}`
          }
          subTitle="Average length of a session"
        />
      </div>
    </Card>
  );
}
