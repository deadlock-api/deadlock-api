import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { PlayerCell } from "~/components/domain/player/PlayerCell";
import { BuildSectionError } from "~/components/features/builds/BuildSectionError";
import { PanelSection } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { StaleOverlay } from "~/components/patterns/states/StaleOverlay";
import { KeyValue, KeyValueList } from "~/components/ui/key-value";
import { Skeleton } from "~/components/ui/skeleton";
import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import type { BuildPurchaseFilters } from "~/queries/hero-build-stats-query";
import { queryKeys } from "~/queries/query-keys";
import { steamProfilesQueryOptions } from "~/queries/steam-queries";

/** How many of the build's most frequent players the section lists. */
const PLAYERS_SHOWN = 8;

/** The players who started the most matches with the build. */
export function BuildTopPlayers({
  heroId,
  buildId,
  playerCount,
  filters,
  active = true,
}: {
  heroId: number;
  buildId: number;
  /** How many players the build has under these filters: the skeleton shows as many rows as the list will. */
  playerCount: number;
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
    minDurationS: filters.minDurationS,
    maxDurationS: filters.maxDurationS,
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

  if (playersQuery.isError) {
    return (
      <BuildSectionError
        title="Most played by"
        what="the players"
        onRetry={() => void playersQuery.refetch()}
        retrying={playersQuery.isFetching}
      />
    );
  }
  return (
    <section className="flex flex-col">
      <PanelSection variant="label" title="Most played by" />
      {players && players.length === 0 ? (
        <EmptyState variant="plain" title="No player on record" />
      ) : (
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
              : // As many rows as the build has players, up to the list's length, so the list keeps its height.
                Array.from({ length: Math.max(1, Math.min(PLAYERS_SHOWN, playerCount)) }, (_, index) => (
                  <KeyValue
                    key={index}
                    // The player cell's own skeleton: the loaded row's height.
                    label={<PlayerCell size="sm" loading />}
                    value={<Skeleton className="h-4 w-16" />}
                  />
                ))}
          </KeyValueList>
        </StaleOverlay>
      )}
    </section>
  );
}
