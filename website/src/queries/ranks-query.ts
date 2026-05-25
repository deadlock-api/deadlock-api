import { queryOptions } from "@tanstack/react-query";
import type { Rank } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export const ranksQueryOptions = queryOptions({
  queryKey: queryKeys.assets.ranks(),
  queryFn: async () => {
    const response = await api.ranks_api.listRanks();
    return response.data as Rank[];
  },
  staleTime: CACHE_DURATIONS.FOREVER,
});
