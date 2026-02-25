import { useQuery } from "@tanstack/react-query";
import { type FC, useEffect, useState } from "react";
import { UPDATE_INTERVAL_MS } from "~/constants/streamkit/widget";
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
  const [stat, setStat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async (region: Region, accountId: string, variable: string, extraArgs: Record<string, string>) => {
    const url = new URL("https://api.deadlock-api.com/v1/commands/variables/resolve");
    url.searchParams.append("region", region);
    url.searchParams.append("account_id", accountId);
    url.searchParams.append("variables", [variable].join(","));

    for (const [key, value] of Object.entries(extraArgs)) {
      if (value) url.searchParams.append(key, value);
    }
    const res = await fetch(url);
    return await res.json();
  };

  const {
    data,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery<Record<string, string>>({
    queryKey: ["stats", region, accountId, variable, extraArgs],
    queryFn: () => fetchStats(region, accountId, variable, extraArgs),
    staleTime: refreshInterval - 10000,
    refetchInterval: refreshInterval,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    setLoading(statsLoading);
    if (data) {
      setStat(data[variable]);
    }
    if (statsError) {
      setStat(null);
      console.error(`Failed to fetch stats: ${statsError}`);
    }
  }, [data, variable, statsLoading, statsError]);

  return (
    <div>
      {loading ? (
        <div className="flex justify-center items-center py-4">
          <div className="relative w-8 h-8">
            <div className="absolute inset-0 rounded-full border-2 border-blue-500/20 animate-ping" />
            <div className="absolute inset-[2px] rounded-full border-2 border-transparent border-t-blue-500 animate-spin" />
          </div>
        </div>
      ) : stat ? (
        <div className="flex gap-2 w-fit items-center">
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
