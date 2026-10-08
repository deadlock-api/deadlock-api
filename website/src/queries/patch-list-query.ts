import { queryOptions } from "@tanstack/react-query";

import { CACHE_DURATIONS } from "~/constants/cache";
import { fetchPatchList } from "~/lib/patch-list-fns";

export const patchListQueryOptions = queryOptions({
  queryKey: ["patch-list"] as const,
  queryFn: () => fetchPatchList(),
  staleTime: CACHE_DURATIONS.ONE_HOUR,
});
