import { HeroImage } from "~/components/HeroImage";
import { formatMatchDuration } from "~/lib/tracker/compute";
import type { LaneMatchup, LanePlayerSouls } from "~/lib/tracker/lane-matchup";
import { cn } from "~/lib/utils";
import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";

function Duo({
  players,
  trackedAccountId,
  nameOf,
}: {
  players: LanePlayerSouls[];
  trackedAccountId: number;
  nameOf: (player: TrackerMatchPlayer) => string;
}) {
  return (
    <div className="flex items-center gap-3">
      {players.map(({ player, souls }) => {
        const tracked = player.account_id === trackedAccountId;
        return (
          <div key={player.account_id} className="flex min-w-0 items-center gap-1.5">
            <HeroImage
              heroId={player.hero_id}
              className={cn("size-6 shrink-0 rounded-full", tracked && "ring-2 ring-foreground")}
            />
            <div className="min-w-0 leading-tight">
              <div className={cn("max-w-[110px] truncate text-xs", tracked && "font-semibold")}>{nameOf(player)}</div>
              <div className="text-xs text-muted-foreground tabular-nums">{souls.toLocaleString("en-US")}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function LaneMatchupCard({
  matchup,
  trackedAccountId,
  nameOf,
}: {
  matchup: LaneMatchup;
  trackedAccountId: number;
  nameOf: (player: TrackerMatchPlayer) => string;
}) {
  const { lane, time, own, enemy, diff } = matchup;
  const verdict = diff > 0 ? "Won lane" : diff < 0 ? "Lost lane" : "Even lane";
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-border px-3 py-2">
      <div className="flex items-center gap-1.5 text-sm font-semibold">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: lane.color }} />
        {lane.name} lane
      </div>
      <Duo players={own} trackedAccountId={trackedAccountId} nameOf={nameOf} />
      <span className="text-xs text-muted-foreground">vs</span>
      <Duo players={enemy} trackedAccountId={trackedAccountId} nameOf={nameOf} />
      <div className="ml-auto text-right leading-tight">
        <div
          className={cn("text-sm font-semibold tabular-nums", diff > 0 && WIN_TEXT_CLASS, diff < 0 && LOSS_TEXT_CLASS)}
        >
          {diff > 0 ? `+${diff.toLocaleString("en-US")}` : diff.toLocaleString("en-US")} souls
        </div>
        <div className="text-xs text-muted-foreground">
          {verdict} at {formatMatchDuration(time)}
        </div>
      </div>
    </div>
  );
}
