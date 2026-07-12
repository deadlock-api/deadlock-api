import { queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiPlayerPerformanceCurveRequest } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export function playerPerformanceCurveQueryOptions(params: AnalyticsApiPlayerPerformanceCurveRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.playerPerformanceCurve(params),
    queryFn: async () => {
      const response = await api.analytics_api.playerPerformanceCurve(params);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
    refetchOnMount: "always",
  });
}
