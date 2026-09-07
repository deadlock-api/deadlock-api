import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { useMemo } from "react";

import { type SteamProfileMap, steamProfileBatches, steamProfilesQueryOptions } from "~/queries/steam-queries";

export type { SteamProfileMap } from "~/queries/steam-queries";

// A stable combine function lets Query preserve the result when batch data is unchanged.
function combineProfiles(queries: UseQueryResult<SteamProfileMap>[]) {
  const profiles: SteamProfileMap = {};
  for (const query of queries) {
    if (query.data) Object.assign(profiles, query.data);
  }
  return { profiles, isLoading: queries.some((query) => query.isLoading) };
}

export function useSteamProfiles(accountIds: number[]) {
  const batches = useMemo(() => steamProfileBatches(accountIds), [accountIds]);

  return useQueries({
    combine: combineProfiles,
    queries: batches.map((batch) => steamProfilesQueryOptions(batch)),
  });
}
