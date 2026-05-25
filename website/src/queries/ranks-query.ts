import { queryOptions } from "@tanstack/react-query";
import type { RankV2 } from "assets_deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export const ranksQueryOptions = queryOptions({
  queryKey: queryKeys.assets.ranks(),
  queryFn: async () => {
    const response = await api.ranks_api.listRanks();
    return response.data as RankV2[];
  },
  staleTime: CACHE_DURATIONS.FOREVER,
});
