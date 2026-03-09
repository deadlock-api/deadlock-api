import { useQuery } from "@tanstack/react-query";
import { UPDATE_INTERVAL_MS } from "~/constants/streamkit/widget";
import { API_ORIGIN } from "~/lib/constants";
import { queryKeys } from "~/queries/query-keys";
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

const fetchStats = async (
  region: Region,
  accountId: string,
  variables: string[],
  auxiliaryVariables: string[] = [],
  extraArgs: Record<string, string> = {},
): Promise<Record<string, string>> => {
  const url = new URL(`${API_ORIGIN}/v1/commands/variables/resolve`);
  url.searchParams.append("region", region);
  url.searchParams.append("account_id", accountId);
  url.searchParams.append("variables", [...variables, ...auxiliaryVariables].join(","));

  for (const [key, value] of Object.entries(extraArgs)) {
    if (value) url.searchParams.append(key, value);
  }

  const res = await fetch(url);
  return await res.json();
};

export const useStats = ({
  region,
  accountId,
  variables,
  auxiliaryVariables = [],
  extraArgs = {},
  refreshInterval = UPDATE_INTERVAL_MS,
}: UseStatsParams): UseStatsResult => {
  const { data, isLoading, error } = useQuery<Record<string, string>>({
    queryKey: queryKeys.streamkit.stats(region, accountId, variables, auxiliaryVariables, extraArgs),
    queryFn: () => fetchStats(region, accountId, variables, auxiliaryVariables, extraArgs),
    staleTime: refreshInterval - 10000,
    refetchInterval: refreshInterval,
    refetchIntervalInBackground: true,
  });

  return { stats: data ?? null, loading: isLoading, error };
};
