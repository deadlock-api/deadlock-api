import { queryOptions } from "@tanstack/react-query";
import type { Rank } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { cdnImageUrl } from "~/lib/image-cdn";

import { queryKeys } from "./query-keys";

/** Badges are drawn at 48px at most; the originals are up to 116 KB each. */
const BADGE_WIDTH = 128;

/** Every WebP badge through the resizer (about 5 KB each); the PNGs stay original for server-side cards. */
function withResizedBadges(rank: Rank): Rank {
  const images = Object.fromEntries(
    Object.entries(rank.images).map(([key, url]) => [
      key,
      url && key.endsWith("_webp") ? cdnImageUrl(url, BADGE_WIDTH) : url,
    ]),
  );
  return { ...rank, images };
}

/**
 * Only the large badges (per tier and per subrank) are shown; the chalk, small and plain subrank variants are 24 of
 * the 40 URLs per rank and would otherwise be dehydrated into every analytics, badge and heatmap page.
 */
function withLargeBadgesOnly(rank: Rank): Rank {
  const images = Object.fromEntries(Object.entries(rank.images).filter(([key]) => key.startsWith("large")));
  return { ...rank, images };
}

export const ranksQueryOptions = queryOptions({
  queryKey: queryKeys.assets.ranks(),
  queryFn: async () => {
    const response = await api.ranks_api.listRanks();
    const ranks = response.data.map(withLargeBadgesOnly);
    return import.meta.env.PROD ? ranks.map(withResizedBadges) : ranks;
  },
  staleTime: CACHE_DURATIONS.FOREVER,
});
