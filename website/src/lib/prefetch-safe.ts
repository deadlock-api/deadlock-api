// Wrap a prefetch promise so a failing API call doesn't abort the route loader.
// Prerender runs every loader at build time — if the API is down or has no data
// for a freshly shipped patch, the build would otherwise fail entirely.
export function prefetchSafe<T>(p: Promise<T>): Promise<T | undefined> {
  return p.catch(() => undefined);
}
