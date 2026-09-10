import { HeroImage } from "~/components/HeroImage";
import { Tooltip, TooltipTrigger } from "~/components/ui/tooltip";
import { formatMatchDuration } from "~/lib/tracker/compute";
import type { LaneMatchup, LanePlayer } from "~/lib/tracker/lane-matchup";
import { cn } from "~/lib/utils";
import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";
import { PanelTooltipContent } from "../shared/PanelTooltipContent";

function Laner({
  laner: { player, stat },
  tracked,
  name,
  mirrored,
}: {
  laner: LanePlayer;
  tracked: boolean;
  name: string;
  /** Enemy laners read from the right edge inward. */
  mirrored?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("flex min-w-0 items-center gap-1 text-xs", mirrored && "flex-row-reverse")}>
          <HeroImage
            heroId={player.hero_id}
            className={cn("size-5 shrink-0 rounded-full", tracked && "ring-2 ring-foreground")}
            title=""
          />
          <span className={cn("min-w-0 flex-1 truncate", mirrored && "text-right", tracked && "font-semibold")}>
            {name}
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            {stat.net_worth.toLocaleString("en-US")}
          </span>
        </div>
      </TooltipTrigger>
      <PanelTooltipContent>
        <div className="font-medium">{name}</div>
        <div className="text-muted-foreground tabular-nums">
          {stat.net_worth.toLocaleString("en-US")} souls · {stat.kills}/{stat.deaths}/{stat.assists} K/D/A
        </div>
        <div className="text-muted-foreground tabular-nums">
          {stat.creep_kills} last hits · {stat.denies} denies · {stat.player_damage.toLocaleString("en-US")} hero damage
        </div>
      </PanelTooltipContent>
    </Tooltip>
  );
}

const DUO_STATS: { label: string; value: (laner: LanePlayer) => number }[] = [
  { label: "Kills", value: (laner) => laner.stat.kills },
  { label: "Last hits", value: (laner) => laner.stat.creep_kills },
  { label: "Denies", value: (laner) => laner.stat.denies },
  { label: "Hero damage", value: (laner) => laner.stat.player_damage },
];

/** The two duos' totals side by side, the leading side brought forward. */
function DuoComparison({ own, enemy }: { own: LanePlayer[]; enemy: LanePlayer[] }) {
  return (
    <div className="border-t border-border/60 pt-1 text-[11px] leading-4 tabular-nums">
      {DUO_STATS.map(({ label, value }) => {
        const ownTotal = own.reduce((sum, laner) => sum + value(laner), 0);
        const enemyTotal = enemy.reduce((sum, laner) => sum + value(laner), 0);
        return (
          <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <span className={cn(ownTotal > enemyTotal ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {ownTotal.toLocaleString("en-US")}
            </span>
            <span className="text-[10px] text-muted-foreground">{label}</span>
            <span
              className={cn(
                "text-right",
                enemyTotal > ownTotal ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {enemyTotal.toLocaleString("en-US")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Each lane's souls at the end of the laning phase, from the tracked player's side, their own lane tinted. */
export function LanesCard({
  matchups,
  trackedAccountId,
  nameOf,
}: {
  matchups: LaneMatchup[];
  trackedAccountId: number;
  nameOf: (player: TrackerMatchPlayer) => string;
}) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-sm font-semibold">Lanes</span>
        <span className="text-xs text-muted-foreground tabular-nums">At {formatMatchDuration(matchups[0].time)}</span>
      </div>
      <div className="grid gap-2 @xl:grid-cols-3">
        {matchups.map(({ lane, own, enemy, diff }) => {
          const ownLane = own.some(({ player }) => player.account_id === trackedAccountId);
          return (
            <div
              key={lane.id}
              className={cn("min-w-0 space-y-1 rounded-md px-2 py-1.5", ownLane ? "bg-accent/70" : "bg-muted/30")}
            >
              <div className="flex items-center gap-1.5">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: lane.color }} />
                <span className="text-sm font-medium">{lane.name}</span>
                <span
                  className={cn(
                    "ml-auto text-sm font-semibold tabular-nums",
                    diff > 0 && WIN_TEXT_CLASS,
                    diff < 0 && LOSS_TEXT_CLASS,
                  )}
                  title={diff > 0 ? "Won lane" : diff < 0 ? "Lost lane" : "Even lane"}
                >
                  {diff > 0 ? `+${diff.toLocaleString("en-US")}` : diff.toLocaleString("en-US")}
                </span>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
                <div className="min-w-0 space-y-1">
                  {own.map((laner) => (
                    <Laner
                      key={laner.player.account_id}
                      laner={laner}
                      tracked={laner.player.account_id === trackedAccountId}
                      name={nameOf(laner.player)}
                    />
                  ))}
                </div>
                <span className="text-[10px] tracking-wide text-muted-foreground uppercase">vs</span>
                <div className="min-w-0 space-y-1">
                  {enemy.map((laner) => (
                    <Laner
                      key={laner.player.account_id}
                      laner={laner}
                      tracked={false}
                      name={nameOf(laner.player)}
                      mirrored
                    />
                  ))}
                </div>
              </div>
              <DuoComparison own={own} enemy={enemy} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
