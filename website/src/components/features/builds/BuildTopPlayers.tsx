import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { PlayerCell } from "~/components/domain/player/PlayerCell";
import { PanelSection } from "~/components/patterns/panel/Panel";
import { StaleOverlay } from "~/components/patterns/states/StaleOverlay";
import { KeyValue, KeyValueList } from "~/components/ui/key-value";
import { Skeleton } from "~/components/ui/skeleton";
import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import type { BuildPurchaseFilters } from "~/queries/hero-build-stats-query";
import { queryKeys } from "~/queries/query-keys";
import { steamProfilesQueryOptions } from "~/queries/steam-queries";

/** How many of the build's most frequent players the section lists. */
const PLAYERS_SHOWN = 5;

/** The players who started the most matches with the build. */
export function BuildTopPlayers({
  heroId,
  buildId,
  filters,
  active = true,
}: {
  heroId: number;
  buildId: number;
  filters: BuildPurchaseFilters;
  /** False while the selection is still moving: nothing is asked for yet. */
  active?: boolean;
}) {
  const request = {
    sortBy: "matches" as const,
    heroId,
    heroBuildId: buildId,
    matchMode: filters.matchMode,
    minAverageBadge: filters.minAverageBadge,
    maxAverageBadge: filters.maxAverageBadge,
    minUnixTimestamp: filters.minUnixTimestamp,
    maxUnixTimestamp: filters.maxUnixTimestamp,
    limit: PLAYERS_SHOWN,
    // The scoreboard's default minimum (20 matches a player) leaves a niche build without anyone.
    minMatches: 1,
  };
  const playersQuery = useQuery({
    queryKey: queryKeys.analytics.playerScoreboard(request),
    queryFn: async () => {
      const response = await api.analytics_api.playerScoreboard(request);
      return response.data.map(({ account_id, matches }) => ({ accountId: account_id, matches }));
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
    enabled: active,
    placeholderData: keepPreviousData,
  });
  const players = playersQuery.data;
  const accountIds = (players ?? []).map((player) => player.accountId).sort((a, b) => a - b);
  const profilesQuery = useQuery({
    ...steamProfilesQueryOptions(accountIds),
    enabled: accountIds.length > 0,
    placeholderData: keepPreviousData,
  });

  if (playersQuery.isError || (players && players.length === 0)) return null;
  return (
    <section className="flex flex-col">
      <PanelSection variant="label" title="Most played by" />
      <StaleOverlay active={playersQuery.isPlaceholderData} label="players">
        <KeyValueList className="px-3 py-0.5">
          {players
            ? players.map((player) => {
                const profile = profilesQuery.data?.[player.accountId];
                return (
                  <KeyValue
                    key={player.accountId}
                    label={
                      <PlayerCell
                        size="sm"
                        accountId={player.accountId}
                        name={profile?.personaname}
                        avatar={profile?.avatar}
                        loading={profilesQuery.isPending}
                      />
                    }
                    value={`${player.matches.toLocaleString("en-US")} ${player.matches === 1 ? "match" : "matches"}`}
                  />
                );
              })
            : Array.from({ length: PLAYERS_SHOWN }, (_, index) => (
                <KeyValue
                  key={index}
                  label={<Skeleton className="h-5 w-32" />}
                  value={<Skeleton className="h-4 w-16" />}
                />
              ))}
        </KeyValueList>
      </StaleOverlay>
    </section>
  );
}
