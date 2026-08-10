import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiLaneSoulCurveRequest } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export function laneSoulCurveQueryOptions(params: AnalyticsApiLaneSoulCurveRequest) {
  const enabled = (params.heroIds?.length ?? 0) >= 2 && (params.enemyHeroIds?.length ?? 0) >= 2;
  return queryOptions({
    queryKey: queryKeys.analytics.laneSoulCurve(params),
    queryFn: async () => {
      const response = await api.analytics_api.laneSoulCurve(params);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
    placeholderData: keepPreviousData,
    enabled,
  });
}
