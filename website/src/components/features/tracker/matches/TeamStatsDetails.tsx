import { NoValue } from "~/components/ui/no-value";
import { TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { formatShare } from "~/lib/format";
import type { PlayerStatColumn } from "~/lib/tracker/player-stats";
import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

export function TeamStatsDetails({
  name,
  players,
  lobbyPlayers,
  columns,
}: {
  name: string;
  /** The scoreboard's columns for the match's mode. */
  columns: PlayerStatColumn[];
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
        {columns.map((column) => {
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
                    · {lobbyTotal > 0 ? formatShare(total / lobbyTotal) : <NoValue label="No lobby total" />}
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
