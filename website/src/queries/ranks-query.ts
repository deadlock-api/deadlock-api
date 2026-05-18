import { queryOptions } from "@tanstack/react-query";
import type { RankV2 } from "assets_deadlock_api_client/api";

import { CACHE_DURATIONS } from "~/constants/cache";
import { assetsApi } from "~/lib/assets-api";

import { queryKeys } from "./query-keys";

export const ranksQueryOptions = queryOptions({
  queryKey: queryKeys.assets.ranks(),
  queryFn: async () => {
    const response = await assetsApi.default_api.getRanksV2RanksGet();
    return response.data as RankV2[];
  },
  staleTime: CACHE_DURATIONS.FOREVER,
});
