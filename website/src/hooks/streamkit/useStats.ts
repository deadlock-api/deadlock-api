import { useQuery } from "@tanstack/react-query";

import { UPDATE_INTERVAL_MS } from "~/constants/streamkit/widget";
import { streamkitStatsQueryOptions } from "~/queries/streamkit-queries";
import type { Region } from "~/types/streamkit/widget";

interface UseStatsParams {
  region: Region;
  accountId: string;
  variables: string[];
  auxiliaryVariables?: string[];
  extraArgs?: Record<string, string>;
  refreshInterval?: number;
}

interface UseStatsResult {
  stats: Record<string, string> | null;
  loading: boolean;
  error: unknown;
}

export const useStats = ({
  region,
  accountId,
  variables,
  auxiliaryVariables = [],
  extraArgs = {},
  refreshInterval = UPDATE_INTERVAL_MS,
}: UseStatsParams): UseStatsResult => {
  const { data, isLoading, error } = useQuery(
    streamkitStatsQueryOptions({
      region,
      accountId,
      variables: [...variables, ...auxiliaryVariables],
      extraArgs,
      refreshInterval,
    }),
  );

  return { stats: data ?? null, loading: isLoading, error };
};
