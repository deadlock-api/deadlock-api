import { queryOptions } from "@tanstack/react-query";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { API_ORIGIN } from "~/lib/constants";
import type { YearRecap } from "~/lib/year-recap/types";

import { queryKeys } from "./query-keys";

/**
 * A player's year in one answer (`/v1/players/{id}/year-recap`, internal, not in the generated client yet): every match
 * of the calendar year plus totals, heroes, records and the rest per game mode. The API caches it for half an hour.
 */
export function yearRecapQueryOptions(accountId: number, year: number) {
  return queryOptions({
    queryKey: queryKeys.players.yearRecap(accountId, year),
    queryFn: async ({ signal }) =>
      (
        await api.client.get<YearRecap>(`${API_ORIGIN}/v1/players/${accountId}/year-recap`, {
          params: { year },
          signal,
        })
      ).data,
    staleTime: CACHE_DURATIONS.FIVE_MINUTES,
    // A recap is a few hundred kilobytes and the slowest part of the page; a failure is worth one retry, not three.
    retry: 1,
  });
}
