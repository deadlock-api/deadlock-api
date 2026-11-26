import { queryOptions } from "@tanstack/react-query";

import { CACHE_DURATIONS } from "~/constants/cache";
import { PATCHES } from "~/lib/constants";
import { fetchPatchList } from "~/lib/patch-list-fns";
import { mergePatchFeed, type PatchEntry, toPatchEntry } from "~/lib/patches";

export const patchListQueryOptions = queryOptions({
  queryKey: ["patch-list"] as const,
  queryFn: () => fetchPatchList(),
  staleTime: CACHE_DURATIONS.ONE_HOUR,
});

/** The curated patches alone: the list until the feed's has loaded, and when it cannot. */
export const CURATED_PATCH_LIST: readonly PatchEntry[] = mergePatchFeed([], PATCHES.map(toPatchEntry));
