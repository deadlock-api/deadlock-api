import { QueryClient, type QueryExecuteOptions, type QueryKey } from "@tanstack/react-query";

// Wrap a prefetch promise so a failing API call doesn't abort the route loader.
// Prerender runs every loader at build time — if the API is down or has no data
// for a freshly shipped patch, the build would otherwise fail entirely.
export function catchPrefetch<T>(p: Promise<T>): Promise<T | undefined> {
  return p.catch(() => undefined);
}

/** How long a client-side navigation waits for a page's data before showing the page with its loading states. */
const CLIENT_WAIT_MS = 300;

/**
 * Like `catchPrefetch`, but in the browser a navigation only waits briefly: a slow or retrying API call used to hold
 * a sidebar click on the old page for as long as it took (20 s and more). The query keeps running and fills the
 * cache, which the page's own `useQuery` picks up. The server still waits, so its HTML carries the data.
 */
export function prefetchSafe<T>(p: Promise<T>): Promise<T | undefined> {
  const caught = catchPrefetch(p);
  if (typeof window === "undefined") return caught;
  return Promise.race([caught, new Promise<undefined>((resolve) => setTimeout(resolve, CLIENT_WAIT_MS))]);
}

/**
 * Prefetch for a query whose full answer is too large to embed in the page (megabytes of rows behind a top-50 view).
 * On the server the cache keeps only `trim(data)`, which must render the view's default state exactly as the full
 * answer would, and the entry is marked invalidated, so the browser refetches the full answer right after hydration
 * while showing the same rows. In the browser it is a plain `prefetchSafe`.
 */
export async function prefetchSeed<T, TKey extends QueryKey>(
  queryClient: QueryClient,
  options: QueryExecuteOptions<T, Error, T, T, TKey>,
  trim: (data: T) => T | Promise<T>,
): Promise<T | undefined> {
  if (typeof window !== "undefined") return prefetchSafe(queryClient.query({ ...options, staleTime: "static" }));
  // The full answer is fetched outside the request's cache: a query still pending there when the HTML is sent (a
  // loader that doesn't wait for it) streams its full answer to the browser after the page, megabytes of it.
  const scratch = new QueryClient({ defaultOptions: queryClient.getDefaultOptions() });
  const data = await catchPrefetch(scratch.query({ ...options, staleTime: "static" }));
  if (data === undefined) return undefined;
  const seed = await trim(data);
  queryClient.setQueryData<T>(options.queryKey, seed);
  void queryClient.invalidateQueries({ queryKey: options.queryKey, exact: true, refetchType: "none" });
  return seed;
}
