import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import HeroImage from "~/components/HeroImage";
import HeroName from "~/components/HeroName";
import { ProgressBarWithLabel } from "~/components/primitives/ProgressBar";
import { Slider } from "~/components/ui/slider";
import type { Dayjs } from "~/dayjs";
import useQueryState from "~/hooks/useQueryState";
import type { APIHeroCombStats } from "~/types/api_hero_comb_stats";

export default function HeroCombStatsTable({
  columns,
  limit,
  hideHeader,
  hideIndex,
  minRankId,
  maxRankId,
  minDate,
  maxDate,
}: {
  columns: string[];
  limit?: number;
  hideHeader?: boolean;
  hideIndex?: boolean;
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs | null;
  maxDate?: Dayjs | null;
}) {
  const [minMatchesFilter, setMinMatchesFilter] = useQueryState<number>("min-matches", 100);
  const [minMatchesFilterT, setMinMatchesFilterT] = useState<number>(100);
  const [combSizeFilter, setCombSizeFilter] = useQueryState<number>("comb-size", 2);
  const [combSizeFilterT, setCombSizeFilterT] = useState<number>(2);
  const [combsToShow, setCombsToShow] = useQueryState<number>("combs-to-show", limit ?? 50);
  const [combsToShowT, setCombsToShowT] = useState<number>(limit ?? 50);

  const minDateTimestamp = useMemo(() => minDate?.unix(), [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const { data: heroData, isLoading } = useQuery<APIHeroCombStats[]>({
    queryKey: [
      "api-hero-comb-stats",
      minRankId,
      maxRankId,
      minDateTimestamp,
      maxDateTimestamp,
      minMatchesFilter,
      combSizeFilter,
    ],
    queryFn: async () => {
      const url = new URL("https://api.deadlock-api.com/v1/analytics/hero-comb-stats");
      url.searchParams.set("comb_size", combSizeFilter.toString());
      url.searchParams.set("min_matches", (minMatchesFilter ?? 100).toString());
      url.searchParams.set("min_average_badge", (minRankId ?? 0).toString());
      url.searchParams.set("max_average_badge", (maxRankId ?? 116).toString());
      if (minDateTimestamp) url.searchParams.set("min_unix_timestamp", minDateTimestamp.toString());
      if (maxDateTimestamp) url.searchParams.set("max_unix_timestamp", maxDateTimestamp.toString());
      const res = await fetch(url);
      return await res.json();
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  const sumMatches = useMemo(() => heroData?.reduce((acc, row) => acc + row.matches, 0) || 0, [heroData]);
  const minMatches = useMemo(() => Math.min(...(heroData || []).map((item) => item.matches)), [heroData]);
  const maxMatches = useMemo(() => Math.max(...(heroData || []).map((item) => item.matches)), [heroData]);
  const sortedData = useMemo(
    () => [...(heroData || [])].sort((a, b) => b?.wins / b?.matches - a?.wins / a?.matches),
    [heroData],
  );
  const minWinrate = useMemo(
    () => sortedData[sortedData.length - 1]?.wins / sortedData[sortedData.length - 1]?.matches || 0,
    [sortedData],
  );
  const maxWinrate = useMemo(() => sortedData[0]?.wins / sortedData[0]?.matches || 0, [sortedData]);
  const numCombs = useMemo(() => heroData?.length ?? 100, [heroData]);
  const limitedData = useMemo(() => sortedData?.slice(0, combsToShow), [combsToShow, sortedData]);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 mx-auto gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="comb-size" className="text-nowrap text-sm text-muted-foreground">
            Combination Size
          </label>
          <div className="flex items-center gap-2">
            <Slider
              id="comb-size"
              min={2}
              max={6}
              value={[combSizeFilterT]}
              defaultValue={[combSizeFilter]}
              onValueCommit={([val]) => setCombSizeFilter(val)}
              onValueChange={([val]) => setCombSizeFilterT(val)}
              className="w-full"
            />
            <span className="ml-2 ">{combSizeFilterT}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="min-matches" className="text-nowrap text-sm text-muted-foreground">
            Min Matches
          </label>
          <div className="flex items-center gap-2">
            <Slider
              id="min-matches"
              min={1}
              step={10}
              max={1000}
              value={[minMatchesFilterT]}
              defaultValue={[minMatchesFilter]}
              onValueCommit={([val]) => setMinMatchesFilter(val)}
              onValueChange={([val]) => setMinMatchesFilterT(val)}
              className="w-full"
            />
            <span className="ml-2">{minMatchesFilterT}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="combs-to-show" className="text-nowrap text-sm text-muted-foreground">
            Combinations to Show
          </label>
          <div className="flex items-center gap-2">
            <Slider
              id="combs-to-show"
              min={0}
              step={100}
              max={Math.min(500, numCombs)}
              value={[combsToShowT]}
              defaultValue={[combsToShow]}
              onValueCommit={([val]) => setCombsToShow(val)}
              onValueChange={([val]) => setCombsToShowT(val)}
              className="w-full"
            />
            <span className="ml-2">{combsToShowT}</span>
          </div>
        </div>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center w-full h-full">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-1 min-w-[600px]">
            {!hideHeader && (
              <thead>
                <tr className="bg-gray-800 text-center">
                  {!hideIndex && <th className="p-2">#</th>}
                  <th className="p-2 text-left">Hero Combination</th>
                  {columns.includes("winRate") && <th className="p-2">Win Rate</th>}
                  {columns.includes("pickRate") && <th className="p-2">Pick Rate</th>}
                  {columns.includes("totalMatches") && <th className="p-2">Total Matches</th>}
                </tr>
              </thead>
            )}
            <tbody>
              {limitedData?.map((row, index) => (
                <tr
                  key={row.hero_ids.join("-")}
                  className="bg-gray-900 rounded-lg shadow border border-gray-800 hover:bg-gray-800 transition-all duration-200 text-center"
                >
                  {!hideIndex && <td className="p-2 align-middle font-semibold">{index + 1}</td>}
                  <td className="p-2 align-middle">
                    <div className="flex items-center gap-2">
                      {row.hero_ids.map((heroId, i) => (
                        <>
                          {i > 0 && <span className="text-2xl">+</span>}
                          <div key={heroId} className="flex items-center gap-2">
                            <HeroImage heroId={heroId} />
                            <HeroName heroId={heroId} />
                          </div>
                        </>
                      ))}
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
                      title={`${row.matches.toLocaleString()} / ${sumMatches.toLocaleString()} total matches`}
                    >
                      <ProgressBarWithLabel
                        min={minMatches}
                        max={maxMatches}
                        value={row.matches}
                        color={"#00ffff"}
                        label={`${(Math.round((row.wins / row.matches) * 100 * 100) / 100).toFixed(2)}% `}
                      />
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
      )}
    </>
  );
}
