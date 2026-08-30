import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { Rank } from "deadlock_api_client";
import { useMemo } from "react";

import { BadgeImage } from "~/components/BadgeImage";
import { HeroImage } from "~/components/HeroImage";
import { Skeleton } from "~/components/ui/skeleton";
import { useSteamProfiles } from "~/hooks/useSteamProfiles";
import { cn } from "~/lib/utils";
import { trackerMatchMetadataQueryOptions } from "~/queries/tracker-queries";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";

const TEAMS = [
  { key: "Team0", name: "The Amber Hand" },
  { key: "Team1", name: "The Sapphire Flame" },
] as const;

export function MatchRowDetails({ matchId, accountId, ranks }: { matchId: number; accountId: number; ranks: Rank[] }) {
  const { data: match, isPending, isError } = useQuery(trackerMatchMetadataQueryOptions(matchId));

  const accountIds = useMemo(() => match?.players.map((player) => player.account_id) ?? [], [match]);
  const { profiles } = useSteamProfiles(accountIds);

  if (isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {TEAMS.map((team) => (
          <div key={team.key} className="space-y-2">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: 6 }, (_, i) => (
              // oxlint-disable-next-line react/no-array-index-key
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (isError || !match) {
    return <div className="py-4 text-center text-sm text-muted-foreground">Failed to load match details.</div>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {TEAMS.map((team, teamIndex) => {
        const players = match.players.filter((player) => player.team === team.key);
        const won = match.winning_team === team.key;
        const averageBadge = teamIndex === 0 ? match.average_badge_team0 : match.average_badge_team1;
        return (
          <div key={team.key} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{team.name}</span>
              <span className={cn("text-xs font-bold", won ? WIN_TEXT_CLASS : LOSS_TEXT_CLASS)}>
                {won ? "Victory" : "Defeat"}
              </span>
              {averageBadge != null && averageBadge > 0 && (
                <BadgeImage badge={averageBadge} ranks={ranks} className="size-5" />
              )}
            </div>
            {players.map((player) => {
              const isTracked = player.account_id === accountId;
              const name = profiles[player.account_id]?.personaname ?? `Player ${player.account_id}`;
              return (
                <div
                  key={player.account_id}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1 text-sm",
                    isTracked && "bg-accent font-medium",
                  )}
                >
                  <HeroImage heroId={player.hero_id} className="size-6 rounded-full" />
                  {isTracked ? (
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                  ) : (
                    <Link
                      to="/players/$accountId"
                      params={{ accountId: String(player.account_id) }}
                      className="min-w-0 flex-1 truncate hover:text-primary hover:underline"
                      title="Open player tracker"
                    >
                      {name}
                    </Link>
                  )}
                  <span className="text-muted-foreground tabular-nums">
                    {player.kills} / {player.deaths} / {player.assists}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
