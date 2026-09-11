import { Tooltip, TooltipTrigger } from "~/components/ui/tooltip";
import type { PerformanceStat } from "~/lib/tracker/performance";
import { cn } from "~/lib/utils";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";
import { PanelTooltipContent } from "../shared/PanelTooltipContent";

function Delta({ stat, baselineMatches }: { stat: PerformanceStat; baselineMatches: number }) {
  const percent = Math.round(((stat.ratio as number) - 1) * 100);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "text-xs font-semibold tabular-nums",
            percent === 0 && "text-muted-foreground",
            percent > 0 && WIN_TEXT_CLASS,
            percent < 0 && LOSS_TEXT_CLASS,
          )}
        >
          {percent === 0 ? "even" : `${percent > 0 ? "+" : ""}${percent}%`}
        </span>
      </TooltipTrigger>
      <PanelTooltipContent>
        <div className="tabular-nums">
          Your average is {stat.average} over {baselineMatches.toLocaleString("en-US")} other matches.
        </div>
      </PanelTooltipContent>
    </Tooltip>
  );
}

/** The tracked player's own stats for the match, each measured against their average where there is one. */
export function PerformanceCard({ stats, baselineMatches }: { stats: PerformanceStat[]; baselineMatches: number }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-sm font-semibold">Your match</span>
        {baselineMatches > 0 && (
          <span className="text-xs text-muted-foreground">against your average over the filtered history</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 @md:grid-cols-4 @3xl:grid-cols-7">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0 leading-tight">
            <div className="truncate text-xs text-muted-foreground">{stat.label}</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-semibold tabular-nums">{stat.value}</span>
              {stat.ratio != null && <Delta stat={stat} baselineMatches={baselineMatches} />}
            </div>
            {stat.note && <div className="truncate text-[11px] text-muted-foreground tabular-nums">{stat.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
