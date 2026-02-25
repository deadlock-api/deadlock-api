import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { UPDATE_INTERVAL_MS } from "~/constants/streamkit/widget";
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
  refreshTrigger: number;
}

const fetchStats = async (
  region: Region,
  accountId: string,
  variables: string[],
  auxiliaryVariables: string[] = [],
  extraArgs: Record<string, string> = {},
): Promise<Record<string, string>> => {
  const url = new URL("https://api.deadlock-api.com/v1/commands/variables/resolve");
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
  const [stats, setStats] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const {
    data,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery<Record<string, string>>({
    queryKey: ["stats", region, accountId, variables, auxiliaryVariables, extraArgs],
    queryFn: () => fetchStats(region, accountId, variables, auxiliaryVariables, extraArgs),
    staleTime: refreshInterval - 10000,
    refetchInterval: refreshInterval,
    refetchIntervalInBackground: true,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: stats is not a dependency
  useEffect(() => {
    setLoading(statsLoading);
    if (statsError) {
      console.error(`Failed to fetch stats: ${statsError}`);
    } else if (data) {
      setRefreshTrigger((prev) => prev + 1);
      const newStats = { ...stats };
      for (const [key, value] of Object.entries(data)) {
        if (value) newStats[key] = value;
      }
      setStats(newStats);
    }
  }, [data, statsLoading, statsError]);

  return { stats, loading, error: statsError, refreshTrigger };
};
