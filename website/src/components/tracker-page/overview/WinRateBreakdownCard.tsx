import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import type { OutcomeSplits } from "~/lib/tracker/compute";

import { SplitGroup } from "./OutcomeSplitRows";

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
