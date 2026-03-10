import { useQuery } from "@tanstack/react-query";
import { type FC } from "react";

import { UPDATE_INTERVAL_MS } from "~/constants/streamkit/widget";
import { API_ORIGIN } from "~/lib/constants";
import { queryKeys } from "~/queries/query-keys";
import type { RawWidgetProps, Region } from "~/types/streamkit/widget";

export const RawWidget: FC<RawWidgetProps> = ({
  region,
  accountId,
  variable = "wins_losses_today",
  prefix = "",
  suffix = "",
  extraArgs = {},
  fontColor = "#ffffff",
  refreshInterval = UPDATE_INTERVAL_MS,
}) => {
  const fetchStats = async (r: Region, id: string, v: string, args: Record<string, string>) => {
    const url = new URL(`${API_ORIGIN}/v1/commands/variables/resolve`);
    url.searchParams.append("region", r);
    url.searchParams.append("account_id", id);
    url.searchParams.append("variables", [v].join(","));

    for (const [key, value] of Object.entries(args)) {
      if (value) url.searchParams.append(key, value);
    }
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch stats: ${res.status} ${res.statusText}`);
      }
      return await res.json();
    } catch (error) {
      console.error("Failed to fetch stats:", error);
      throw error;
    }
  };

  const {
    data,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery<Record<string, string>>({
    queryKey: queryKeys.streamkit.stats(region, accountId, variable, extraArgs),
    queryFn: () => fetchStats(region, accountId, variable, extraArgs),
    staleTime: refreshInterval - 10000,
    refetchInterval: refreshInterval,
    refetchIntervalInBackground: true,
  });

  const stat = statsError ? null : (data?.[variable] ?? null);

  return (
    <div>
      {statsLoading ? (
        <div className="flex items-center justify-center py-4">
          <div className="relative h-8 w-8">
            <div className="absolute inset-0 animate-ping rounded-full border-2 border-blue-500/20" />
            <div className="absolute inset-[2px] animate-spin rounded-full border-2 border-transparent border-t-blue-500" />
          </div>
        </div>
      ) : stat ? (
        <div className="flex w-fit items-center gap-2">
          <div className="text-4xl font-bold" style={{ color: fontColor }}>
            {variable.endsWith("img") ? (
              <img src={stat} alt={variable} className="h-20 rounded-full" />
            ) : (
              prefix + stat + suffix
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
