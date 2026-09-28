import { createServerFn } from "@tanstack/react-start";

import { api } from "~/lib/api";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import { heroMatchups, type MatchupPeriod } from "~/lib/matchup-stats";

export interface HeroMatchupsRequest {
  heroId: number;
  minAverageBadge: number;
  maxAverageBadge: number;
  minUnixTimestamp: number;
  maxUnixTimestamp?: number;
  prevMinUnixTimestamp: number;
  prevMaxUnixTimestamp?: number;
  gameMode: GameMode;
  matchMode: MatchMode;
}

async function loadPeriod(
  filters: Pick<HeroMatchupsRequest, "minAverageBadge" | "maxAverageBadge" | "gameMode" | "matchMode">,
  minUnixTimestamp: number,
  maxUnixTimestamp: number | undefined,
): Promise<MatchupPeriod> {
  const range = { ...filters, minUnixTimestamp, maxUnixTimestamp };
  const [heroStats, synergies, counters] = await Promise.all([
    api.analytics_api.heroStats({ ...range, minHeroMatches: 0, minHeroMatchesTotal: 0 }),
    api.analytics_api.heroSynergiesStats({ ...range, minMatches: 0 }),
    api.analytics_api.heroCountersStats({ ...range, minMatches: 0 }),
  ]);
  return { heroStats: heroStats.data, synergies: synergies.data, counters: counters.data };
}

/**
 * The synergy and counter responses cover every pair of heroes (~840 KB). The server keeps them and sends one hero's
 * rows (a few KB), so the hero page renders its matchups, and the links to each matched hero, in its first HTML.
 */
export const fetchHeroMatchups = createServerFn({ method: "GET" })
  .validator((request: HeroMatchupsRequest) => request)
  .handler(async ({ data: request }) => {
    const filters = {
      minAverageBadge: request.minAverageBadge,
      maxAverageBadge: request.maxAverageBadge,
      gameMode: request.gameMode,
      matchMode: request.matchMode,
    };
    const [current, previous] = await Promise.all([
      loadPeriod(filters, request.minUnixTimestamp, request.maxUnixTimestamp),
      // The previous period only adds trend deltas; the matchups stand without it.
      loadPeriod(filters, request.prevMinUnixTimestamp, request.prevMaxUnixTimestamp).catch(() => undefined),
    ]);
    return heroMatchups(request.heroId, current, previous);
  });
