import { HeroImage } from "~/components/HeroImage";
import { formatMatchDuration } from "~/lib/tracker/compute";
import type { LaneMatchup, LanePlayer } from "~/lib/tracker/lane-matchup";
import { cn } from "~/lib/utils";
import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";
import { TooltipHeader, TooltipStat, TooltipStats } from "../shared/PanelTooltipContent";
import { TrackerDetailPopover } from "../shared/TrackerDetailPopover";

function Laner({
  laner: { player, stat },
  tracked,
  name,
  time,
  mirrored,
}: {
  laner: LanePlayer;
  tracked: boolean;
  name: string;
  time: number;
  /** Enemy laners read from the right edge inward. */
  mirrored?: boolean;
}) {
  return (
    <TrackerDetailPopover
      label={`${name}'s lane stats`}
      size="xs"
      className="w-full min-w-0 justify-start px-0"
      details={
        <>
          <TooltipHeader
            lead={<HeroImage heroId={player.hero_id} className="size-8 shrink-0 rounded-full" title="" />}
            title={name}
            subtitle={
              stat ? `Recorded at ${formatMatchDuration(stat.time_stamp_s)}` : `At ${formatMatchDuration(time)}`
            }
          />
          {stat ? (
            <TooltipStats>
              <TooltipStat label="Souls" value={stat.net_worth.toLocaleString("en-US")} />
              <TooltipStat
                label="Kills / deaths / assists"
                value={`${stat.kills} / ${stat.deaths} / ${stat.assists}`}
              />
              <TooltipStat label="Last hits" value={stat.creep_kills.toLocaleString("en-US")} />
              <TooltipStat label="Denies" value={stat.denies.toLocaleString("en-US")} />
              <TooltipStat label="Hero damage" value={stat.player_damage.toLocaleString("en-US")} />
            </TooltipStats>
          ) : (
            <p className="text-xs text-muted-foreground">No player stats were recorded at or before this time.</p>
          )}
        </>
      }
    >
      <span className={cn("flex w-full min-w-0 items-center gap-1", mirrored && "flex-row-reverse")}>
        <HeroImage
          heroId={player.hero_id}
          className={cn("size-5 shrink-0 rounded-full", tracked && "ring-2 ring-foreground")}
          title=""
        />
        <span className={cn("min-w-0 flex-1 truncate", mirrored && "text-right", tracked && "font-semibold")}>
          {name}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {stat?.net_worth.toLocaleString("en-US") ?? "—"}
        </span>
      </span>
    </TrackerDetailPopover>
  );
}

/** Each lane's recorded souls at the comparison time, from the tracked player's side. */
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
        {matchups.map(({ lane, time, own, enemy, diff }) => {
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
                    diff != null && diff > 0 && WIN_TEXT_CLASS,
                    diff != null && diff < 0 && LOSS_TEXT_CLASS,
                    diff == null && "text-muted-foreground",
                  )}
                  title={
                    diff == null
                      ? "Lane soul comparison unavailable: missing player stats"
                      : `Lane soul difference at ${formatMatchDuration(time)}`
                  }
                >
                  {diff == null ? "—" : diff > 0 ? `+${diff.toLocaleString("en-US")}` : diff.toLocaleString("en-US")}
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
                      time={time}
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
                      time={time}
                      mirrored
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
