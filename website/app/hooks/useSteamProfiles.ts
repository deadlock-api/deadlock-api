import { useQueries } from "@tanstack/react-query";
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

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export function useSteamProfiles(accountIds: number[]) {
  const batches = useMemo(() => chunk(accountIds, STEAM_BATCH_SIZE), [accountIds]);

  const queries = useQueries({
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

  const isLoading = queries.some((q) => q.isLoading);

  const profiles = useMemo(() => {
    const merged: SteamProfileMap = {};
    for (const query of queries) {
      if (query.data) Object.assign(merged, query.data);
    }
    return merged;
  }, [queries]);

  return { profiles, isLoading };
}
