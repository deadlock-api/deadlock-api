import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { formatPlaytime, type SessionMomentum } from "~/lib/tracker/compute";

import { SplitGroup } from "./OutcomeSplitRows";

export function SessionMomentumCard({
  momentum,
  overallWinrate,
}: {
  momentum: SessionMomentum;
  overallWinrate: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Session momentum</CardTitle>
        <CardDescription>How the result depends on where a match falls in a play session</CardDescription>
      </CardHeader>
      <CardContent className="@container">
        {momentum.sessions > 0 ? (
          <div className="space-y-5">
            <SplitGroup title="Match in session" splits={momentum.byPosition} overallWinrate={overallWinrate} />
            <SplitGroup title="Previous match" splits={momentum.byPreviousResult} overallWinrate={overallWinrate} />
            <div
              className="text-xs text-muted-foreground tabular-nums"
              title="Matches less than three hours apart count as one session"
            >
              {momentum.sessions.toLocaleString("en-US")} {momentum.sessions === 1 ? "session" : "sessions"} ·{" "}
              {momentum.avgMatchesPerSession.toFixed(1)} matches per session ·{" "}
              {formatPlaytime(momentum.avgSessionTimeS)} average
            </div>
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
