import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useSeasons } from "~/hooks/useSeasons";
import type { PeriodLists } from "~/lib/period";
import { CURATED_PATCH_LIST, patchListQueryOptions } from "~/queries/patch-list-query";

/**
 * The patches (`/v2/patches` over the curated `PATCHES`) and the ranked seasons a date filter's period resolves
 * against. The root loader loads both for every page with a date filter, so the server and the browser resolve the
 * same bounds; until the feed has answered, and when it cannot, the patches are the curated ones.
 */
export function usePeriodLists(): PeriodLists & { isPending: boolean } {
  const { seasons, isPending } = useSeasons();
  const { data } = useQuery(patchListQueryOptions);
  const patches = data ?? CURATED_PATCH_LIST;
  return useMemo(() => ({ seasons, patches, isPending }), [seasons, patches, isPending]);
}
