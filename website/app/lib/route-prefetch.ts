import type { QueryClient } from "@tanstack/react-query";

import { prefetchRouteQueries } from "~/lib/prefetch";

export const PREFETCH_NEIGHBORS: Record<string, readonly string[]> = {
  "/": ["/heroes", "/items", "/leaderboard", "/games"],
  "/heroes": ["/items", "/abilities"],
  "/items": ["/heroes", "/abilities"],
  "/abilities": ["/heroes"],
  "/leaderboard": ["/badge-distribution"],
  "/badge-distribution": ["/leaderboard"],
  "/games": ["/heroes", "/badge-distribution"],
  "/heatmap": ["/heroes"],
  "/player-scoreboard": ["/leaderboard"],
};

function shouldSkipPrefetch(): boolean {
  if (typeof navigator === "undefined") return true;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return true;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData) return true;
  if (conn?.effectiveType === "2g" || conn?.effectiveType === "slow-2g") return true;
  return false;
}

export function prefetchNeighbors(path: string, queryClient: QueryClient) {
  if (shouldSkipPrefetch()) return;
  const neighbors = PREFETCH_NEIGHBORS[path];
  if (!neighbors) return;
  for (const neighbor of neighbors) {
    prefetchRouteQueries(neighbor, queryClient);
  }
}
