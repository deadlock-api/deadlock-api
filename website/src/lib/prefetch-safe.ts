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
