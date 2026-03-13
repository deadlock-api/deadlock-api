import type { QueryClient } from "@tanstack/react-query";

import { day } from "~/dayjs";
import { PATCHES } from "~/lib/constants";
import { getDefaultRegion } from "~/lib/region";
import { abilityOrderQueryOptions } from "~/queries/ability-order-query";
import { abilitiesQueryOptions, heroesQueryOptions, itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { badgeDistributionQueryOptions } from "~/queries/badge-distribution-queries";
import { gameStatsQueryOptions } from "~/queries/games-query";
import { mapQueryOptions } from "~/queries/heatmap-queries";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";
import { leaderboardQueryOptions } from "~/queries/leaderboard-queries";
import { playerScoreboardQueryOptions } from "~/queries/player-scoreboard-query";
import { ranksQueryOptions } from "~/queries/ranks-query";

type PrefetchFn = (queryClient: QueryClient) => void;

const latestPatch = PATCHES[0];

const prefetchMap: Record<string, PrefetchFn> = {
  "/heroes": (qc) => {
    qc.prefetchQuery(heroesQueryOptions);
    qc.prefetchQuery(ranksQueryOptions);
    qc.prefetchQuery(
      heroStatsQueryOptions({
        gameMode: "normal",
        minAverageBadge: 91,
        maxAverageBadge: 116,
        minUnixTimestamp: latestPatch.startDate.unix(),
        maxUnixTimestamp: latestPatch.endDate.unix(),
      }),
    );
  },
  "/items": (qc) => {
    qc.prefetchQuery(heroesQueryOptions);
    qc.prefetchQuery(itemUpgradesQueryOptions);
    qc.prefetchQuery(ranksQueryOptions);
    qc.prefetchQuery(
      itemStatsQueryOptions({
        gameMode: "normal",
        minAverageBadge: 91,
        maxAverageBadge: 116,
        minMatches: 10,
        minUnixTimestamp: latestPatch.startDate.unix(),
        maxUnixTimestamp: latestPatch.endDate.unix(),
      }),
    );
  },
  "/abilities": (qc) => {
    qc.prefetchQuery(heroesQueryOptions);
    qc.prefetchQuery(abilitiesQueryOptions);
    qc.prefetchQuery(ranksQueryOptions);
    qc.prefetchQuery(
      abilityOrderQueryOptions({
        heroId: 2,
        gameMode: "normal",
        minMatches: 20,
        minUnixTimestamp: latestPatch.startDate.unix(),
        maxUnixTimestamp: latestPatch.endDate.unix(),
      }),
    );
  },
  "/games": (qc) => {
    qc.prefetchQuery(ranksQueryOptions);
    qc.prefetchQuery(
      gameStatsQueryOptions({
        gameMode: "normal",
        bucket: "no_bucket",
        minUnixTimestamp: latestPatch.startDate.unix(),
        maxUnixTimestamp: latestPatch.endDate.unix(),
      }),
    );
  },
  "/leaderboard": (qc) => {
    qc.prefetchQuery(ranksQueryOptions);
    qc.prefetchQuery(leaderboardQueryOptions(getDefaultRegion()));
  },
  "/badge-distribution": (qc) => {
    qc.prefetchQuery(ranksQueryOptions);
    qc.prefetchQuery(badgeDistributionQueryOptions({}));
  },
  "/player-scoreboard": (qc) => {
    qc.prefetchQuery(heroesQueryOptions);
    qc.prefetchQuery(ranksQueryOptions);
    qc.prefetchQuery(
      playerScoreboardQueryOptions({
        sortBy: "kills",
        sortDirection: "desc",
        gameMode: "normal",
        minMatches: 0,
        minAverageBadge: 0,
        maxAverageBadge: 116,
        minUnixTimestamp: day().subtract(30, "day").startOf("day").unix(),
        maxUnixTimestamp: day().endOf("day").unix(),
        start: 0,
        limit: 1000,
      }),
    );
  },
  "/heatmap": (qc) => {
    qc.prefetchQuery(heroesQueryOptions);
    qc.prefetchQuery(mapQueryOptions);
    qc.prefetchQuery(ranksQueryOptions);
  },
};

export function prefetchRouteQueries(path: string, queryClient: QueryClient) {
  prefetchMap[path]?.(queryClient);
}
