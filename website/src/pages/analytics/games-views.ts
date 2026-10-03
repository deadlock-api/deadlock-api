import type { AnalyticsTab } from "~/lib/analytics-tabs";
import { preloadableLazy } from "~/lib/preloadable-lazy";

// The games views other than the overview, each in its own chunk.
export const GamesOverTimeChart = preloadableLazy(() => import("~/components/features/games/GamesOverTimeChart"));
export const GamesByRankChart = preloadableLazy(() => import("~/components/features/games/GamesByRankChart"));
export const EconomyTab = preloadableLazy(() => import("~/components/features/games/EconomyTab"));
export const BuffsTab = preloadableLazy(() => import("~/components/features/games/BuffsTab"));

const VIEWS: Partial<Record<AnalyticsTab<"games">, { preload: () => Promise<void> }>> = {
  "over-time": GamesOverTimeChart,
  "by-rank": GamesByRankChart,
  economy: EconomyTab,
  buffs: BuffsTab,
};

/** Loads a view's code, so the page renders it instead of its loading state. */
export function preloadGamesView(tab: AnalyticsTab<"games">) {
  return VIEWS[tab]?.preload();
}
