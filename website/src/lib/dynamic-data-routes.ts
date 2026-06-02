// Analytics routes whose loaders prefetch live API data. Prerendering these
// bakes the API response into static HTML at build time, so the page would
// serve data frozen at the last deploy (the cause of multi-day-stale numbers).
// They are excluded from prerender (rendered per-request instead, still SSR so
// SEO/first paint keep full HTML) and given a short shared-cache TTL so the
// origin isn't hit on every request.
export const DYNAMIC_DATA_ROUTES: ReadonlySet<string> = new Set([
  "/games",
  "/heroes",
  "/items",
  "/abilities",
  "/leaderboard",
  "/badge-distribution",
  "/heatmap",
  "/player-scoreboard",
  "/servers",
]);
