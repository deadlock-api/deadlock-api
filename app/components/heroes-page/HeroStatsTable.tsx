import { useQuery } from "@tanstack/react-query";
import type { Dayjs } from "dayjs";
import { useMemo } from "react";
import HeroImage from "~/components/HeroImage";
import HeroName from "~/components/HeroName";
import { ProgressBarWithLabel } from "~/components/primitives/ProgressBar";
import type { APIHeroStats } from "~/types/api_hero_stats";
import { cn } from "../../lib/utils";

export default function HeroStatsTable({
  columns,
  limit,
  hideHeader,
  hideIndex,
  sortBy,
  minRankId,
  maxRankId,
  minDate,
  maxDate,
  fullWidth,
}: {
  columns: string[];
  limit?: number;
  hideHeader?: boolean;
  hideIndex?: boolean;
  sortBy?: keyof APIHeroStats | "winrate";
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs | null;
  maxDate?: Dayjs | null;
  fullWidth?: boolean;
}) {
  const minDateTimestamp = useMemo(() => minDate?.unix(), [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const { data: heroData, isLoading } = useQuery<APIHeroStats[]>({
    queryKey: ["api-hero-stats", minRankId, maxRankId, minDateTimestamp, maxDateTimestamp],
    queryFn: async () => {
      const url = new URL("https://api.deadlock-api.com/v1/analytics/hero-stats");
      url.searchParams.set("min_average_badge", (minRankId ?? 0).toString());
      url.searchParams.set("max_average_badge", (maxRankId ?? 116).toString());
      if (minDateTimestamp) url.searchParams.set("min_unix_timestamp", minDateTimestamp.toString());
      if (maxDateTimestamp) url.searchParams.set("max_unix_timestamp", maxDateTimestamp.toString());
      const res = await fetch(url);
      return await res.json();
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  const minWinrate = useMemo(() => Math.min(...(heroData || []).map((item) => item.wins / item.matches)), [heroData]);
  const maxWinrate = useMemo(() => Math.max(...(heroData || []).map((item) => item.wins / item.matches)), [heroData]);
  const minMatches = useMemo(() => Math.min(...(heroData || []).map((item) => item.matches)), [heroData]);
  const maxMatches = useMemo(() => Math.max(...(heroData || []).map((item) => item.matches)), [heroData]);
  const sumMatches = useMemo(() => heroData?.reduce((acc, row) => acc + row.matches, 0) || 0, [heroData]);
  const sortedData = useMemo(
    () =>
      sortBy
        ? [...(heroData || [])].sort((a, b) => {
            const a_score = sortBy !== "winrate" ? a[sortBy] : a.wins / a.matches;
            const b_score = sortBy !== "winrate" ? b[sortBy] : b.wins / b.matches;
            return b_score - a_score;
          })
        : heroData,
    [heroData, sortBy],
  );
  const limitedData = useMemo(() => (limit ? sortedData?.slice(0, limit) : sortedData), [sortedData, limit]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className={cn("w-full border-separate border-spacing-y-1", fullWidth ? "min-w-[600px]" : "min-w-fit")}>
          {!hideHeader && (
            <thead>
              <tr className="bg-gray-800 text-center">
                {!hideIndex && <th className="p-2">#</th>}
                <th className="p-2 text-left">Hero</th>
                {columns.includes("winRate") && <th className="p-2">Win Rate</th>}
                {columns.includes("pickRate") && <th className="p-2">Pick Rate</th>}
                {columns.includes("KDA") && <th className="p-2">Kills/Deaths/Assists</th>}
                {columns.includes("totalMatches") && <th className="p-2">Total Matches</th>}
              </tr>
            </thead>
          )}
          <tbody>
            {limitedData?.map((row, index) => (
              <tr
                key={row.hero_id}
                className="bg-gray-900 rounded-lg shadow border border-gray-800 hover:bg-gray-800 transition-all duration-200 text-center"
              >
                {!hideIndex && <td className="p-2 align-middle font-semibold">{index + 1}</td>}
                <td className="p-2 align-middle">
                  <div className="flex items-center gap-2">
                    <HeroImage heroId={row.hero_id} />
                    <HeroName heroId={row.hero_id} />
                  </div>
                </td>
                {columns.includes("winRate") && (
                  <td
                    className="p-2 align-middle"
                    title={`${row.wins.toLocaleString()} wins / ${row.matches.toLocaleString()} matches`}
                  >
                    <ProgressBarWithLabel
                      min={minWinrate}
                      max={maxWinrate}
                      value={row.wins / row.matches}
                      color={"#ff00ff"}
                      label={`${(Math.round((row.wins / row.matches) * 100 * 100) / 100).toFixed(2)}% `}
                    />
                  </td>
                )}
                {columns.includes("pickRate") && (
                  <td
                    className="p-2 align-middle"
                    title={`${row.matches.toLocaleString()} matches / ${maxMatches.toLocaleString()} total matches`}
                  >
                    <ProgressBarWithLabel
                      min={minMatches}
                      max={maxMatches}
                      value={row.matches}
                      color={"#00ffff"}
                      label={`${(Math.round(12 * (row.matches / sumMatches) * 100 * 100) / 100).toFixed(2)}% `}
                    />
                  </td>
                )}
                {columns.includes("KDA") && (
                  <td className="p-2 align-middle">
                    <span className="px-2 font-semibold text-green-500">
                      {(Math.round((row.total_kills / row.matches) * 10) / 10).toFixed(1)}
                    </span>
                    /
                    <span className="px-2 font-semibold text-red-500">
                      {(Math.round((row.total_deaths / row.matches) * 10) / 10).toFixed(1)}
                    </span>
                    /
                    <span className="px-2 font-semibold text-orange-500">
                      {(Math.round((row.total_assists / row.matches) * 10) / 10).toFixed(1)}
                    </span>
                  </td>
                )}
                {columns.includes("totalMatches") && (
                  <td className="p-2 align-middle">{row.matches.toLocaleString()}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
