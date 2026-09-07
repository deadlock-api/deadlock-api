import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import type { OutcomeSplit, OutcomeSplits } from "~/lib/tracker/compute";
import { cn } from "~/lib/utils";

import { LOSS_COLOR, LOSS_TEXT_CLASS, WIN_COLOR, WIN_TEXT_CLASS } from "../shared/colors";

const MIN_MATCHES_FOR_DELTA = 5;

function SplitRow({ split, overallWinrate }: { split: OutcomeSplit; overallWinrate: number }) {
  const winrate = split.matches > 0 ? split.wins / split.matches : null;
  const percent = winrate === null ? null : Math.round(winrate * 100);
  const delta =
    percent !== null && split.matches >= MIN_MATCHES_FOR_DELTA ? percent - Math.round(overallWinrate * 100) : null;
  return (
    <div
      className="flex items-center gap-3 text-sm"
      title={
        winrate === null
          ? "No matches"
          : `${split.wins} wins · ${split.matches - split.wins} losses over ${split.matches} matches`
      }
    >
      <span className="w-28 shrink-0 truncate text-muted-foreground @md:w-36">{split.label}</span>
      <div className="flex h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        {winrate !== null && (
          <>
            <span style={{ width: `${winrate * 100}%`, backgroundColor: WIN_COLOR }} />
            <span className="flex-1" style={{ backgroundColor: LOSS_COLOR }} />
          </>
        )}
      </div>
      <span className="w-11 shrink-0 text-right font-semibold tabular-nums">
        {percent === null ? "—" : `${percent}%`}
      </span>
      <span
        className={cn(
          "w-8 shrink-0 text-right text-xs tabular-nums",
          delta === null || delta === 0 ? "text-muted-foreground" : delta > 0 ? WIN_TEXT_CLASS : LOSS_TEXT_CLASS,
        )}
        title={delta === null ? undefined : "Compared to the overall win rate"}
      >
        {delta === null ? "" : delta === 0 ? "±0" : `${delta > 0 ? "+" : "−"}${Math.abs(delta)}`}
      </span>
      <span className="hidden w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums @md:inline">
        {split.matches === 0
          ? ""
          : `${split.matches.toLocaleString("en-US")} ${split.matches === 1 ? "match" : "matches"}`}
      </span>
    </div>
  );
}

function SplitGroup({
  title,
  splits,
  overallWinrate,
}: {
  title: string;
  splits: OutcomeSplit[];
  overallWinrate: number;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground uppercase">{title}</div>
      {splits.map((split) => (
        <SplitRow key={split.label} split={split} overallWinrate={overallWinrate} />
      ))}
    </div>
  );
}

export function WinRateBreakdownCard({ splits, overallWinrate }: { splits: OutcomeSplits; overallWinrate: number }) {
  const hasMatches = splits.bySide.some((split) => split.matches > 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Win rate breakdown</CardTitle>
        <CardDescription>How the result depends on game length and team side</CardDescription>
      </CardHeader>
      <CardContent className="@container">
        {hasMatches ? (
          <div className="space-y-5">
            <SplitGroup title="Game length" splits={splits.byDuration} overallWinrate={overallWinrate} />
            <SplitGroup title="Team side" splits={splits.bySide} overallWinrate={overallWinrate} />
          </div>
        ) : (
          <div className="flex h-[120px] items-center justify-center text-sm text-muted-foreground">
            No matches in the selected range.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
