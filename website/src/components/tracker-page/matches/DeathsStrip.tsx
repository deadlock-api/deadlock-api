import { Skull } from "lucide-react";

import { HeroImage } from "~/components/HeroImage";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { formatMatchDuration } from "~/lib/tracker/compute";
import type { DeathSummary } from "~/lib/tracker/deaths";
import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

export function DeathsStrip({
  summary,
  matchDurationS,
  nameOf,
}: {
  summary: DeathSummary;
  matchDurationS: number;
  nameOf: (player: TrackerMatchPlayer) => string;
}) {
  const { deaths, deadForS } = summary;
  const deadShare = matchDurationS > 0 ? Math.round((deadForS / matchDurationS) * 100) : 0;
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-sm font-semibold">Deaths</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {deaths.length === 0
            ? "Deathless"
            : `${deaths.length} ${deaths.length === 1 ? "death" : "deaths"} · ${formatMatchDuration(deadForS)} dead · ${deadShare}% of the match`}
        </span>
      </div>
      {deaths.length > 0 && (
        <div className="flex flex-wrap gap-x-1 gap-y-2">
          {deaths.map((death) => (
            <Tooltip key={death.time}>
              <TooltipTrigger asChild>
                <div className="flex w-9 flex-col items-center gap-0.5">
                  {death.killer ? (
                    <HeroImage heroId={death.killer.hero_id} className="size-7 rounded-full" />
                  ) : (
                    <span className="flex size-7 items-center justify-center rounded-full bg-muted">
                      <Skull className="size-4 text-muted-foreground" />
                    </span>
                  )}
                  <span className="text-[10px] leading-none text-muted-foreground tabular-nums">
                    {formatMatchDuration(death.time)}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {death.killer ? `Killed by ${nameOf(death.killer)}` : "Killed by a non-player"} in{" "}
                {Math.round(death.timeToKillS)}s · respawned after {death.deadForS}s
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
}
