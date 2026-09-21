import { queryOptions } from "@tanstack/react-query";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { isDemoAccount } from "~/lib/tracker/demo";

import { queryKeys } from "./query-keys";

export interface SteamProfile {
  personaname: string;
  avatar: string;
  profileurl: string;
}

export type SteamProfileMap = Record<number, SteamProfile>;

export { steamProfileBatches } from "~/lib/steam-profile-batches";

export function steamProfilesQueryOptions(batch: number[]) {
  return queryOptions({
    queryKey: queryKeys.steam.profiles(batch),
    queryFn: async () => {
      // Generated players exist only on the demo tracker profile; Steam has never heard of them.
      const demoIds = batch.filter(isDemoAccount);
      const realIds = batch.filter((accountId) => !isDemoAccount(accountId));
      const [demoData, response] = await Promise.all([
        demoIds.length > 0 ? import("~/lib/tracker/demo-data") : null,
        realIds.length > 0 ? api.steam_api.steam({ accountIds: realIds }) : null,
      ]);
      const map: SteamProfileMap = {};
      for (const profile of [...(response?.data ?? []), ...demoIds.map((id) => demoData!.demoSteamProfile(id))]) {
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
