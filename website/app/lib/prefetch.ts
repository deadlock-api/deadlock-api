import type { QueryClient } from "@tanstack/react-query";

import { computePreviousPeriod } from "~/components/PatchOrDatePicker";
import { DEFAULT_DATE_RANGE, PATCHES } from "~/lib/constants";
import { getDefaultRegion } from "~/lib/region";
import { normalizeUnixCeil, normalizeUnixFloor, roundedNow } from "~/lib/time-normalize";
import { abilityOrderQueryOptions } from "~/queries/ability-order-query";
import { abilitiesQueryOptions, heroesQueryOptions, itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { badgeDistributionQueryOptions } from "~/queries/badge-distribution-queries";
import { gameStatsQueryOptions } from "~/queries/games-query";
import { killDeathStatsQueryOptions, mapQueryOptions } from "~/queries/heatmap-queries";
import { heroBanStatsQueryOptions } from "~/queries/hero-ban-stats-query";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";
import { leaderboardQueryOptions } from "~/queries/leaderboard-queries";
import { playerScoreboardQueryOptions } from "~/queries/player-scoreboard-query";
import { ranksQueryOptions } from "~/queries/ranks-query";

type PrefetchFn = (queryClient: QueryClient) => void;

type TimestampedParams = { minUnixTimestamp?: number; maxUnixTimestamp?: number };

const [defaultStart, defaultEnd] = DEFAULT_DATE_RANGE;
const defaultMinUnix = normalizeUnixFloor(defaultStart);
const defaultMaxUnix = normalizeUnixCeil(defaultEnd);
const defaultPrev = computePreviousPeriod(defaultStart, defaultEnd, PATCHES);
const defaultPrevMinUnix = normalizeUnixFloor(defaultPrev.prevStartDate);
const defaultPrevMaxUnix = normalizeUnixCeil(defaultPrev.prevEndDate);

function prefetchCurrentAndPrev<P extends TimestampedParams, O>(
  qc: QueryClient,
  optionsFn: (params: P) => O,
  params: P,
) {
  const prefetch = (p: P) => qc.prefetchQuery(optionsFn(p) as Parameters<typeof qc.prefetchQuery>[0]);
  prefetch(params);
  if (defaultPrevMinUnix != null && defaultPrevMaxUnix != null) {
    prefetch({ ...params, minUnixTimestamp: defaultPrevMinUnix, maxUnixTimestamp: defaultPrevMaxUnix });
  }
}

function rollingThirtyDayWindow() {
  const start = roundedNow("day").subtract(30, "day");
  return {
    minUnixTimestamp: normalizeUnixFloor(start),
    maxUnixTimestamp: normalizeUnixCeil(roundedNow("day")),
  };
}

const prefetchMap: Record<string, PrefetchFn> = {
  "/heroes": (qc) => {
    qc.prefetchQuery(heroesQueryOptions);
    qc.prefetchQuery(ranksQueryOptions);
    prefetchCurrentAndPrev(qc, heroStatsQueryOptions, {
      minHeroMatches: 0,
      minHeroMatchesTotal: 0,
      minAverageBadge: 91,
      maxAverageBadge: 116,
      minUnixTimestamp: defaultMinUnix,
      maxUnixTimestamp: defaultMaxUnix,
      gameMode: "normal" as const,
    });
    prefetchCurrentAndPrev(qc, heroBanStatsQueryOptions, {
      minAverageBadge: 91,
      maxAverageBadge: 116,
      minUnixTimestamp: defaultMinUnix,
      maxUnixTimestamp: defaultMaxUnix,
    });
  },
  "/items": (qc) => {
    qc.prefetchQuery(heroesQueryOptions);
    qc.prefetchQuery(itemUpgradesQueryOptions);
    qc.prefetchQuery(ranksQueryOptions);
    prefetchCurrentAndPrev(qc, itemStatsQueryOptions, {
      minMatches: 10,
      heroId: null,
      minAverageBadge: 91,
      maxAverageBadge: 116,
      minUnixTimestamp: defaultMinUnix,
      maxUnixTimestamp: defaultMaxUnix,
      minBoughtAtS: undefined,
      maxBoughtAtS: undefined,
      gameMode: "normal" as const,
    });
  },
  "/abilities": (qc) => {
    qc.prefetchQuery(heroesQueryOptions);
    qc.prefetchQuery(abilitiesQueryOptions);
    qc.prefetchQuery(ranksQueryOptions);
    qc.prefetchQuery(
      abilityOrderQueryOptions({
        heroId: 2,
        minAverageBadge: 0,
        maxAverageBadge: 116,
        minUnixTimestamp: defaultMinUnix,
        maxUnixTimestamp: defaultMaxUnix,
        minMatches: 20,
        gameMode: "normal",
        includeItemIds: undefined,
        excludeItemIds: undefined,
      }),
    );
  },
  "/games": (qc) => {
    qc.prefetchQuery(ranksQueryOptions);
    prefetchCurrentAndPrev(qc, gameStatsQueryOptions, {
      gameMode: "normal" as const,
      bucket: "no_bucket" as const,
      minAverageBadge: 0,
      maxAverageBadge: 116,
      minDurationS: undefined,
      maxDurationS: undefined,
      minUnixTimestamp: defaultMinUnix,
      maxUnixTimestamp: defaultMaxUnix,
    });
  },
  "/leaderboard": (qc) => {
    qc.prefetchQuery(ranksQueryOptions);
    qc.prefetchQuery(leaderboardQueryOptions(getDefaultRegion(), null));
  },
  "/badge-distribution": (qc) => {
    qc.prefetchQuery(ranksQueryOptions);
    qc.prefetchQuery(
      badgeDistributionQueryOptions({
        ...rollingThirtyDayWindow(),
        minDurationS: undefined,
        maxDurationS: undefined,
      }),
    );
  },
  "/player-scoreboard": (qc) => {
    qc.prefetchQuery(heroesQueryOptions);
    qc.prefetchQuery(ranksQueryOptions);
    qc.prefetchQuery(
      playerScoreboardQueryOptions({
        sortBy: "kills",
        sortDirection: "desc",
        gameMode: "normal",
        heroId: undefined,
        minMatches: 0,
        minAverageBadge: 0,
        maxAverageBadge: 116,
        ...rollingThirtyDayWindow(),
        start: 0,
        limit: 1000,
      }),
    );
  },
  "/heatmap": (qc) => {
    qc.prefetchQuery(heroesQueryOptions);
    qc.prefetchQuery(mapQueryOptions);
    qc.prefetchQuery(ranksQueryOptions);
    qc.prefetchQuery(
      killDeathStatsQueryOptions({
        team: 0,
        heroIds: undefined,
        gameMode: "normal",
        minAverageBadge: undefined,
        maxAverageBadge: undefined,
        minUnixTimestamp: defaultMinUnix,
        maxUnixTimestamp: defaultMaxUnix,
        minGameTimeS: undefined,
        maxGameTimeS: undefined,
      }),
    );
  },
};

export function prefetchRouteQueries(path: string, queryClient: QueryClient) {
  prefetchMap[path]?.(queryClient);
}
