import { dehydrate, QueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";

import { abilitiesQueryOptions, heroesQueryOptions, itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";

/** Per-request QueryClient for loaders. Never reused — disposed after the loader returns its dehydrated state. */
export function makeServerQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        throwOnError: (error) => {
          // Treat 5xx as errors that bubble; 4xx render as empty state on client.
          if (error instanceof AxiosError && error.response?.status) {
            return error.response.status >= 500;
          }
          return false;
        },
      },
    },
  });
}

/** Default edge cache header for analytics/SEO routes: 5min browser, 15min CDN, 1h stale-while-revalidate. */
export const ANALYTICS_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=3600",
};

/** Run a set of prefetches in parallel and return the dehydrated cache.
 *  Prefetch failures don't abort SSR — failed queries simply aren't in the cache and the client refetches. */
export async function prefetchAndDehydrate(prefetches: Array<(qc: QueryClient) => Promise<unknown>>) {
  const queryClient = makeServerQueryClient();
  await Promise.allSettled(prefetches.map((fn) => fn(queryClient)));
  return dehydrate(queryClient);
}

export const assetPrefetches = {
  heroes: (qc: QueryClient) => qc.prefetchQuery(heroesQueryOptions),
  items: (qc: QueryClient) => qc.prefetchQuery(itemUpgradesQueryOptions),
  abilities: (qc: QueryClient) => qc.prefetchQuery(abilitiesQueryOptions),
  ranks: (qc: QueryClient) => qc.prefetchQuery(ranksQueryOptions),
};
