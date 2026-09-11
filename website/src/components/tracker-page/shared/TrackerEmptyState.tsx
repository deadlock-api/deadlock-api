import { ChartNoAxesCombined, History } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "~/components/ui/empty";
import type { TrackerFilterValues } from "~/lib/tracker/compute";
import type { FilterRecovery } from "~/lib/tracker/filter-recovery";

export function TrackerEmptyState({
  hasHistory,
  recoveries,
  onRecover,
}: {
  hasHistory: boolean;
  recoveries: FilterRecovery[];
  onRecover: (filters: TrackerFilterValues) => void;
}) {
  return (
    <Empty className="border" aria-live="polite">
      <EmptyHeader>
        <EmptyMedia variant="icon">{hasHistory ? <ChartNoAxesCombined /> : <History />}</EmptyMedia>
        <EmptyTitle>{hasHistory ? "No matches fit these filters" : "No match history yet"}</EmptyTitle>
        <EmptyDescription>
          {hasHistory
            ? recoveries.length > 0
              ? "Your history is available. Broaden your selection to see your performance overview."
              : "This history has no supported matches yet. The tracker covers normal ranked, unranked and Street Brawl matches."
            : "If this account was prioritized recently, matches may still be backfilling. The tracker will check again automatically."}
        </EmptyDescription>
      </EmptyHeader>
      {recoveries.length > 0 && (
        <EmptyContent>
          {recoveries.map((recovery, index) => (
            <Button
              key={recovery.label}
              variant={index === 0 ? "default" : "outline"}
              className="w-full"
              onClick={() => onRecover(recovery.filters)}
            >
              {recovery.label}
              <span className="ml-auto tabular-nums">{recovery.matches.toLocaleString("en-US")}</span>
            </Button>
          ))}
          <p className="text-xs text-muted-foreground">Match counts preview each change.</p>
        </EmptyContent>
      )}
    </Empty>
  );
}
