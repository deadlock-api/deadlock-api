import { Skull } from "lucide-react";
import type { ReactNode } from "react";

import { HeroImage } from "~/components/HeroImage";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { formatMatchDuration } from "~/lib/tracker/compute";
import type { FightSummary } from "~/lib/tracker/fights";
import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

function EventChip({ player, time, tooltip }: { player: TrackerMatchPlayer | null; time: number; tooltip: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex w-9 flex-col items-center gap-0.5">
          {player ? (
            <HeroImage heroId={player.hero_id} className="size-7 rounded-full" />
          ) : (
            <span className="flex size-7 items-center justify-center rounded-full bg-muted">
              <Skull className="size-4 text-muted-foreground" />
            </span>
          )}
          <span className="text-[10px] leading-none text-muted-foreground tabular-nums">
            {formatMatchDuration(time)}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function EventRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-12 shrink-0 pt-2 text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-x-1 gap-y-2">{children}</div>
    </div>
  );
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

export function KillsDeathsStrip({
  fights,
  matchDurationS,
  nameOf,
}: {
  fights: FightSummary;
  matchDurationS: number;
  nameOf: (player: TrackerMatchPlayer) => string;
}) {
  const { kills, deaths, deadForS } = fights;
  const deadShare = matchDurationS > 0 ? Math.round((deadForS / matchDurationS) * 100) : 0;
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-sm font-semibold whitespace-nowrap">Kills & deaths</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {count(kills.length, "kill")} · {count(deaths.length, "death")}
          {deaths.length > 0 && ` · ${formatMatchDuration(deadForS)} dead · ${deadShare}% of the match`}
        </span>
      </div>
      <div className="space-y-2">
        {kills.length > 0 && (
          <EventRow label="Kills">
            {kills.map((kill) => (
              <EventChip
                key={`${kill.victim.account_id}-${kill.time}`}
                player={kill.victim}
                time={kill.time}
                tooltip={`Killed ${nameOf(kill.victim)}`}
              />
            ))}
          </EventRow>
        )}
        {deaths.length > 0 && (
          <EventRow label="Deaths">
            {deaths.map((death) => (
              <EventChip
                key={death.time}
                player={death.killer}
                time={death.time}
                tooltip={
                  <>
                    {death.killer ? `Killed by ${nameOf(death.killer)}` : "Killed by a non-player"} in{" "}
                    {Math.round(death.timeToKillS)}s · respawned after {death.deadForS}s
                  </>
                }
              />
            ))}
          </EventRow>
        )}
      </div>
    </div>
  );
}
