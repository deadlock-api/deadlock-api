import { useQuery } from "@tanstack/react-query";
import { parseAsInteger, useQueryState } from "nuqs";
import { useId, useMemo, useState } from "react";
import HeroImage from "~/components/HeroImage";
import { LoadingLogo } from "~/components/LoadingLogo";
import HeroName from "~/components/HeroName";
import { ProgressBarWithLabel } from "~/components/primitives/ProgressBar";
import { Slider } from "~/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import type { Dayjs } from "~/dayjs";
import { api } from "~/lib/api";

export default function HeroCombStatsTable({
  columns,
  limit,
  hideHeader,
  hideIndex,
  minRankId,
  maxRankId,
  minMatches: minHeroMatches,
  minDate,
  maxDate,
}: {
  columns: string[];
  limit?: number;
  hideHeader?: boolean;
  hideIndex?: boolean;
  minRankId?: number;
  maxRankId?: number;
  minMatches?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
}) {
  const combSizeId = useId();
  const combsToShowId = useId();

  const [combSizeFilter, setCombSizeFilter] = useQueryState("comb_size", parseAsInteger.withDefault(2));
  const [combSizeFilterT, setCombSizeFilterT] = useState<number>(2);
  const [combsToShow, setCombsToShow] = useQueryState("combs_to_show", parseAsInteger.withDefault(limit ?? 50));
  const [combsToShowT, setCombsToShowT] = useState<number>(limit ?? 50);

  const minDateTimestamp = useMemo(() => minDate?.unix() ?? 0, [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const { data: heroData, isLoading } = useQuery({
    queryKey: [
      "api-hero-comb-stats",
      minRankId,
      maxRankId,
      minDateTimestamp,
      maxDateTimestamp,
      combSizeFilter,
      minHeroMatches,
    ],
    queryFn: async () => {
      const response = await api.analytics_api.heroCombStats({
        combSize: combSizeFilter,
        minMatches: minHeroMatches ?? 0,
        minAverageBadge: minRankId ?? 0,
        maxAverageBadge: maxRankId ?? 116,
        minUnixTimestamp: minDateTimestamp,
        maxUnixTimestamp: maxDateTimestamp,
      });
      return response.data;
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  const sumMatches = useMemo(() => heroData?.reduce((acc, row) => acc + row.matches, 0) || 0, [heroData]);
  const minMatches = useMemo(() => Math.min(...(heroData || []).map((item) => item.matches)), [heroData]);
  const maxMatches = useMemo(() => Math.max(...(heroData || []).map((item) => item.matches)), [heroData]);
  const sortedData = useMemo(
    () =>
      [...(heroData || [])]
        .filter((row) => new Set(row.hero_ids).size === combSizeFilter)
        .sort((a, b) => b?.wins / b?.matches - a?.wins / a?.matches),
    [heroData, combSizeFilter],
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
          <label htmlFor={combSizeId} className="text-nowrap text-sm text-muted-foreground">
            Combination Size
          </label>
          <div className="flex items-center gap-2">
            <Slider
              id={combSizeId}
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
          <label htmlFor={combsToShowId} className="text-nowrap text-sm text-muted-foreground">
            Combinations to Show
          </label>
          <div className="flex items-center gap-2">
            <Slider
              id={combsToShowId}
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
        <div className="flex items-center justify-center w-full h-full py-16">
          <LoadingLogo />
        </div>
      ) : (
        <Table>
          {!hideHeader && (
            <TableHeader className="bg-muted">
              <TableRow>
                {!hideIndex && <TableHead className="text-center">#</TableHead>}
                <TableHead>Hero Combination</TableHead>
                {columns.includes("winRate") && <TableHead className="text-center">Win Rate</TableHead>}
                {columns.includes("pickRate") && <TableHead className="text-center">Pick Rate</TableHead>}
                {columns.includes("totalMatches") && <TableHead className="text-center">Total Matches</TableHead>}
              </TableRow>
            </TableHeader>
          )}
          <TableBody>
            {limitedData?.map((row, index) => (
              <TableRow key={row.hero_ids.join("-")}>
                {!hideIndex && <TableCell className="font-semibold text-center">{index + 1}</TableCell>}
                <TableCell>
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
                </TableCell>
                {columns.includes("winRate") && (
                  <TableCell
                    className="text-center"
                    title={`${row.wins.toLocaleString()} wins / ${row.matches.toLocaleString()} matches`}
                  >
                    <ProgressBarWithLabel
                      min={minWinrate}
                      max={maxWinrate}
                      value={row.wins / row.matches}
                      color={"#fa4454"}
                      label={`${(Math.round((row.wins / row.matches) * 100)).toFixed(0)}% `}
                    />
                  </TableCell>
                )}
                {columns.includes("pickRate") && (
                  <TableCell
                    className="text-center"
                    title={`${row.matches.toLocaleString()} / ${sumMatches.toLocaleString()} total matches`}
                  >
                    <ProgressBarWithLabel
                      min={minMatches}
                      max={maxMatches}
                      value={row.matches}
                      color={"#22d3ee"}
                      label={`${(Math.round((row.wins / row.matches) * 100)).toFixed(0)}% `}
                    />
                  </TableCell>
                )}
                {columns.includes("totalMatches") && (
                  <TableCell className="text-center">{row.matches.toLocaleString()}</TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
