import { useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import type { OutcomeSplits, SessionMomentum } from "~/lib/tracker/compute";

import { SplitGroup } from "./OutcomeSplitRows";

type View = "match" | "session";

const VIEWS: { key: View; label: string; description: string }[] = [
  { key: "match", label: "Match", description: "How the result depends on game length and team side" },
  { key: "session", label: "Session", description: "How the result depends on where a match falls in a session" },
];

export function SplitsCard({
  splits,
  momentum,
  overallWinrate,
}: {
  splits: OutcomeSplits;
  momentum: SessionMomentum;
  overallWinrate: number;
}) {
  const [viewKey, setViewKey] = useState<View>("match");
  const view = VIEWS.find((candidate) => candidate.key === viewKey) ?? VIEWS[0];
  const hasMatches = splits.bySide.some((split) => split.matches > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">Win rate splits</CardTitle>
          <CardDescription>{view.description}</CardDescription>
        </div>
        <ToggleGroup
          type="single"
          value={viewKey}
          onValueChange={(value) => value && setViewKey(value as View)}
          variant="outline"
          size="sm"
          aria-label="Split group"
        >
          {VIEWS.map((candidate) => (
            <ToggleGroupItem key={candidate.key} value={candidate.key} className="text-xs">
              {candidate.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardHeader>
      <CardContent className="@container">
        {hasMatches ? (
          <div className="space-y-5">
            {viewKey === "match" ? (
              <>
                <SplitGroup title="Game length" splits={splits.byDuration} overallWinrate={overallWinrate} />
                <SplitGroup title="Team side" splits={splits.bySide} overallWinrate={overallWinrate} />
              </>
            ) : (
              <>
                <SplitGroup title="Match in session" splits={momentum.byPosition} overallWinrate={overallWinrate} />
                <SplitGroup title="Previous match" splits={momentum.byPreviousResult} overallWinrate={overallWinrate} />
              </>
            )}
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
