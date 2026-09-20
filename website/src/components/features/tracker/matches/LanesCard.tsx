import { HeroImage } from "~/components/domain/assets/HeroImage";
import { Card } from "~/components/ui/card";
import { DetailPopover } from "~/components/ui/detail-popover";
import { StatusDot } from "~/components/ui/status-dot";
import { TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { TONE_TEXT, toneOf } from "~/lib/tone";
import { formatMatchDuration } from "~/lib/tracker/compute";
import type { LaneMatchup, LanePlayer } from "~/lib/tracker/lane-matchup";
import { cn } from "~/lib/utils";
import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

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
    <DetailPopover
      label={`${name}'s lane stats`}
      size="xs"
      className="w-full min-w-0 justify-start px-0"
      details={
        <>
          <TooltipHeader
            leading={<HeroImage heroId={player.hero_id} shape="circle" className="shrink-0" title="" />}
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
          shape="circle"
          ring={tracked ? "primary" : "none"}
          className="size-5 shrink-0"
          title=""
        />
        <span className={cn("min-w-0 flex-1 truncate", mirrored && "text-end", tracked && "font-semibold")}>
          {name}
        </span>
        <span className="shrink-0 text-2xs text-muted-foreground tabular-nums">
          {stat?.net_worth.toLocaleString("en-US") ?? "—"}
        </span>
      </span>
    </DetailPopover>
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
    <Card tone="inset" size="xs" className="px-3">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold">Lanes</span>
        <span className="text-xs text-muted-foreground tabular-nums">At {formatMatchDuration(matchups[0].time)}</span>
      </div>
      <div className="grid gap-2 @xl:grid-cols-3">
        {matchups.map(({ lane, time, own, enemy, diff }) => {
          const ownLane = own.some(({ player }) => player.account_id === trackedAccountId);
          return (
            <Card
              key={lane.id}
              tone={ownLane ? "primary" : "muted"}
              size="xs"
              radius="md"
              className="gap-1 px-2 py-1.5"
            >
              <div className="flex items-center gap-1.5">
                <StatusDot color={lane.color} />
                <span className="text-sm font-medium">{lane.name}</span>
                <span
                  className={cn("ms-auto text-sm font-semibold tabular-nums", diff !== 0 && TONE_TEXT[toneOf(diff)])}
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
                <div className="flex min-w-0 flex-col gap-1">
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
                <span className="eyebrow">vs</span>
                <div className="flex min-w-0 flex-col gap-1">
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
            </Card>
          );
        })}
      </div>
    </Card>
  );
}
