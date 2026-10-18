import type { AnalyticsTab } from "~/lib/analytics-tabs";
import { preloadableLazy } from "~/lib/preloadable-lazy";

// The hero views whose body is a chart or a heavy table, each in its own chunk.
export const HeroStatsOverTimeChart = preloadableLazy(async () => ({
  default: (await import("~/components/features/heroes/HeroStatsOverTimeChart")).HeroStatsOverTimeChart,
}));
export const HeroStatsByDurationChart = preloadableLazy(async () => ({
  default: (await import("~/components/features/heroes/HeroStatsByDurationChart")).HeroStatsByDurationChart,
}));
export const HeroStatsByRankChart = preloadableLazy(async () => ({
  default: (await import("~/components/features/heroes/HeroStatsByRankChart")).HeroStatsByRankChart,
}));
export const HeroStatsByExperienceTable = preloadableLazy(async () => ({
  default: (await import("~/components/features/heroes/HeroStatsByExperienceTable")).HeroStatsByExperienceTable,
}));
export const HeroMatchupStatsTable = preloadableLazy(async () => ({
  default: (await import("~/components/features/heroes/HeroMatchupStatsTable")).HeroMatchupStatsTable,
}));
export const HeroCombStatsTable = preloadableLazy(async () => ({
  default: (await import("~/components/features/heroes/HeroCombStatsTable")).HeroCombStatsTable,
}));
export const HeroTierList = preloadableLazy(async () => ({
  default: (await import("~/components/features/heroes/HeroTierList")).HeroTierList,
}));
export const HeroMatchupExplorer = preloadableLazy(async () => ({
  default: (await import("~/components/features/heroes/HeroMatchupExplorer")).HeroMatchupExplorer,
}));

const VIEWS: Partial<Record<AnalyticsTab<"heroes">, { preload: () => Promise<void> }>> = {
  "tier-list": HeroTierList,
  "stats-over-time": HeroStatsOverTimeChart,
  "stats-by-duration": HeroStatsByDurationChart,
  "stats-by-rank": HeroStatsByRankChart,
  "stats-by-experience": HeroStatsByExperienceTable,
  matchups: HeroMatchupStatsTable,
  "hero-combs": HeroCombStatsTable,
  "hero-matchup-details": HeroMatchupExplorer,
};

/** Loads a view's code, so the page renders it instead of its loading state. */
export function preloadHeroView(tab: AnalyticsTab<"heroes">) {
  return VIEWS[tab]?.preload();
}
