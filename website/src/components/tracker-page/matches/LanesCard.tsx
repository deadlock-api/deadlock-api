import { HeroImage } from "~/components/HeroImage";
import { formatMatchDuration } from "~/lib/tracker/compute";
import type { LaneMatchup, LanePlayerSouls } from "~/lib/tracker/lane-matchup";
import { cn } from "~/lib/utils";
import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";

function Laner({
  laner: { player, souls },
  tracked,
  name,
}: {
  laner: LanePlayerSouls;
  tracked: boolean;
  name: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <HeroImage
        heroId={player.hero_id}
        className={cn("size-6 shrink-0 rounded-full", tracked && "ring-2 ring-foreground")}
      />
      <span className={cn("min-w-0 flex-1 truncate text-xs", tracked && "font-semibold")}>{name}</span>
      <span className="text-xs text-muted-foreground tabular-nums">{souls.toLocaleString("en-US")}</span>
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
        <span className="text-xs text-muted-foreground tabular-nums">
          Souls at {formatMatchDuration(matchups[0].time)}
        </span>
      </div>
      <div className="grid gap-2 @xl:grid-cols-3">
        {matchups.map(({ lane, own, enemy, diff }) => {
          const ownLane = own.some(({ player }) => player.account_id === trackedAccountId);
          return (
            <div
              key={lane.id}
              className={cn("min-w-0 space-y-1.5 rounded-md px-2.5 py-2", ownLane ? "bg-accent/70" : "bg-muted/30")}
            >
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: lane.color }} />
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
              {own.map((laner) => (
                <Laner
                  key={laner.player.account_id}
                  laner={laner}
                  tracked={laner.player.account_id === trackedAccountId}
                  name={nameOf(laner.player)}
                />
              ))}
              <div className="flex items-center gap-2 text-[10px] tracking-wide text-muted-foreground uppercase">
                <span className="h-px flex-1 bg-border" />
                vs
                <span className="h-px flex-1 bg-border" />
              </div>
              {enemy.map((laner) => (
                <Laner key={laner.player.account_id} laner={laner} tracked={false} name={nameOf(laner.player)} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
