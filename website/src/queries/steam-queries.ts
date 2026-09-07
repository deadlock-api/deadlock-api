import { queryOptions } from "@tanstack/react-query";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export interface SteamProfile {
  personaname: string;
  avatar: string;
  profileurl: string;
}

export type SteamProfileMap = Record<number, SteamProfile>;

const STEAM_BATCH_SIZE = 500;

export function steamProfileBatches(accountIds: number[]): number[][] {
  const batches: number[][] = [];
  for (let i = 0; i < accountIds.length; i += STEAM_BATCH_SIZE) {
    batches.push(accountIds.slice(i, i + STEAM_BATCH_SIZE));
  }
  return batches;
}

export function steamProfilesQueryOptions(batch: number[]) {
  return queryOptions({
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
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
}
