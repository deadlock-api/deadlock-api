import { queryOptions } from "@tanstack/react-query";
import { type GameStatsParams, fetchGameStats } from "~/lib/game-stats-api";

export function gameStatsQueryOptions(params: GameStatsParams) {
  return queryOptions({
    queryKey: [
      "api-game-stats",
      params.bucket,
      params.game_mode,
      params.min_unix_timestamp,
      params.max_unix_timestamp,
      params.min_duration_s,
      params.max_duration_s,
      params.min_average_badge,
      params.max_average_badge,
    ],
    queryFn: () => fetchGameStats(params),
    staleTime: 24 * 60 * 60 * 1000,
  });
}
