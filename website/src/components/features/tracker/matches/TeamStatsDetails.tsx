import { TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/panel-tooltip";
import { formatShare } from "~/lib/format";
import { PLAYER_STAT_COLUMNS } from "~/lib/tracker/player-stats";
import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

export function TeamStatsDetails({
  name,
  players,
  lobbyPlayers,
}: {
  name: string;
  players: TrackerMatchPlayer[];
  lobbyPlayers: TrackerMatchPlayer[];
}) {
  const kills = players.reduce((sum, player) => sum + player.kills, 0);
  const deaths = players.reduce((sum, player) => sum + player.deaths, 0);
  const assists = players.reduce((sum, player) => sum + player.assists, 0);
  return (
    <>
      <TooltipHeader title={name} subtitle={`${players.length} players · % of match totals`} />
      <TooltipStats>
        <TooltipStat label="Kills / deaths / assists" value={`${kills} / ${deaths} / ${assists}`} />
        {PLAYER_STAT_COLUMNS.map((column) => {
          const total = players.reduce((sum, player) => sum + column.value(player), 0);
          const lobbyTotal = lobbyPlayers.reduce((sum, player) => sum + column.value(player), 0);
          return (
            <TooltipStat
              key={column.key}
              label={column.label}
              value={
                <>
                  {Math.round(total).toLocaleString("en-US")}
                  <span className="text-muted-foreground">
                    {" "}
                    · {lobbyTotal > 0 ? formatShare(total / lobbyTotal) : "—"}
                  </span>
                </>
              }
            />
          );
        })}
      </TooltipStats>
    </>
  );
}
