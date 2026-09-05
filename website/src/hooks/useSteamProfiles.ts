import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { useMemo } from "react";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { queryKeys } from "~/queries/query-keys";

interface SteamProfile {
  personaname: string;
  avatar: string;
  profileurl: string;
}

export type SteamProfileMap = Record<number, SteamProfile>;

const STEAM_BATCH_SIZE = 500;

// A stable combine function lets Query preserve the result when batch data is unchanged.
function combineProfiles(queries: UseQueryResult<SteamProfileMap>[]) {
  const profiles: SteamProfileMap = {};
  for (const query of queries) {
    if (query.data) Object.assign(profiles, query.data);
  }
  return { profiles, isLoading: queries.some((query) => query.isLoading) };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export function useSteamProfiles(accountIds: number[]) {
  const batches = useMemo(() => chunk(accountIds, STEAM_BATCH_SIZE), [accountIds]);

  return useQueries({
    combine: combineProfiles,
    queries: batches.map((batch) => ({
      queryKey: queryKeys.steam.profiles(batch),
      queryFn: async () => {
        const response = await api.steam_api.steam({ accountIds: batch });
        const map: SteamProfileMap = {};
        for (const profile of response.data) {
          map[profile.account_id] = {
            personaname: profile.personaname,
            avatar: profile.avatar,
            profileurl: profile.profileurl,
          };
        }
        return map;
      },
      enabled: batch.length > 0,
      staleTime: CACHE_DURATIONS.ONE_DAY,
    })),
  });
}
