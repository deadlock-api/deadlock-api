import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent } from "~/components/ui/card";
import { type Dayjs, day } from "~/dayjs";
import { API_ORIGIN, ASSETS_ORIGIN } from "~/lib/constants";
import type { APIPlayerMMRHistory } from "~/types/api_player_mmr_history";
import type { AssetsRank } from "~/types/assets_rank";

export default function MMRChart({
  steamId,
  hero,
  minDate,
  maxDate,
}: {
  steamId: number;
  hero?: number | null;
  minDate?: Dayjs;
  maxDate?: Dayjs;
}) {
  const { data: ranksData, isLoading: isLoadingAssetsRanks } = useQuery<AssetsRank[]>({
    queryKey: ["assets-ranks"],
    queryFn: () => fetch(new URL("/v2/ranks", ASSETS_ORIGIN)).then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const { data: mmrData, isLoading: isLoadingMMR } = useQuery<APIPlayerMMRHistory[]>({
    queryKey: ["api-mmr", steamId, hero],
    queryFn: async () => {
      const url = hero
        ? new URL(`/v1/players/${steamId}/mmr-history/${hero}`, API_ORIGIN)
        : new URL(`/v1/players/${steamId}/mmr-history`, API_ORIGIN);
      const res = await fetch(url);
      return await res.json();
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  const rankNames = useMemo(() => {
    return ranksData?.reduce(
      (acc, rank) => {
        acc[rank.tier * 10 + 1] = `${rank.name} 1`;
        acc[rank.tier * 10 + 6] = `${rank.name} 6`;
        return acc;
      },
      {} as Record<number, string>,
    );
  }, [ranksData]);

  const formattedData = useMemo(
    () =>
      mmrData
        ?.filter((d) => !minDate || d.start_time >= minDate.unix())
        .filter((d) => !maxDate || d.start_time <= maxDate.unix())
        .map((d) => ({
          date: day.unix(d.start_time).toDate(),
          match: d.match_id,
          mmr: (d.player_score * 116) / 66,
          rank: rankNames?.[d.rank] || "",
        })),
    [rankNames, mmrData, minDate, maxDate],
  );

  const minRank = useMemo(() => Math.min(...(formattedData || []).map((d) => d.mmr)), [formattedData]);
  const maxRank = useMemo(() => Math.max(...(formattedData || []).map((d) => d.mmr)), [formattedData]);

  const rankIds = useMemo(
    () =>
      ranksData?.reduce((acc, rank) => {
        acc.push(rank.tier * 10 + 1);
        acc.push(rank.tier * 10 + 6);
        return acc;
      }, [] as number[]),
    [ranksData],
  );

  if (isLoadingMMR || isLoadingAssetsRanks) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!formattedData || formattedData.length === 0) {
    return (
      <Card className="w-fit mx-auto border-red-600">
        <CardContent>
          <p className="text-sm text-red-600 font-bold">No MMR data available for this player</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={800} className="p-6 bg-gray-800">
      <LineChart data={formattedData} margin={{ top: 20, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="date"
          scale="time"
          tickFormatter={(timestamp) => day(timestamp).format("MM/DD/YY")}
          label={{ value: "Date", position: "insideBottom", offset: -15 }}
          stroke="#9ca3af"
        />
        <YAxis
          dataKey="rank"
          tickFormatter={(value) => rankNames?.[value] || ""}
          ticks={rankIds?.filter((r) => r >= minRank - 5 && r <= maxRank + 5)}
          domain={[minRank - 5, maxRank + 5]}
          tick={{ fontSize: 14, width: 96 }}
          stroke="#9ca3af"
        />
        <Tooltip
          labelFormatter={(label) => day(label).format("YYYY-MM-DD")}
          contentStyle={{ backgroundColor: "#1e293b", borderColor: "#4b5563" }}
          itemStyle={{ color: "#e5e7eb" }}
        />
        <Line
          type="monotone"
          dataKey="mmr"
          stroke="#fa4454"
          dot={{ r: 3, className: "fill-primary" }}
          activeDot={{ r: 6 }}
          strokeWidth={1}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
