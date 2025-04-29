import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import ItemImage from "~/components/item_image";
import ItemName from "~/components/item_name";
import { ProgressBarWithLabel } from "~/components/progress_bar";
import type { APIItemStats } from "~/types/api_item_stats";
import type { AssetsItem } from "~/types/assets_item";

export default function ItemStatsTable({
  columns,
  limit,
  hideHeader,
  sortBy,
}: {
  columns: string[];
  limit?: number;
  hideHeader?: boolean;
  sortBy?: keyof APIItemStats | "winrate";
}) {
  const { data: assetsItems } = useQuery<AssetsItem[]>({
    queryKey: ["assets-items-upgrades"],
    queryFn: () => fetch("https://assets.deadlock-api.com/v2/items/by-type/upgrade").then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const { data } = useQuery<APIItemStats[]>({
    queryKey: ["api-item-stats"],
    queryFn: () => fetch("https://api.deadlock-api.com/v1/analytics/item-stats").then((res) => res.json()),
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  const maxMatches = useMemo(() => Math.max(...(data || []).map((item) => item.matches)), [data]);
  const sumMatches = useMemo(() => (data || []).reduce((acc, item) => acc + item.matches, 0), [data]);
  const filteredData = useMemo(
    () => data?.filter((d) => assetsItems?.map((i) => i.id).includes(d.item_id)),
    [data, assetsItems],
  );
  const sortedData = useMemo(
    () =>
      sortBy
        ? [...(filteredData || [])].sort((a, b) => {
            const a_score = sortBy !== "winrate" ? a[sortBy] : a.wins / a.matches;
            const b_score = sortBy !== "winrate" ? b[sortBy] : b.wins / b.matches;
            return b_score - a_score;
          })
        : filteredData,
    [filteredData, sortBy],
  );
  const limitedData = useMemo(() => (limit ? sortedData?.slice(0, limit) : sortedData), [sortedData, limit]);

  return (
    <>
      <table className="w-full border-separate border-spacing-y-1">
        {!hideHeader && (
          <thead>
            <tr className="bg-gray-800 text-center">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3 text-left">Item</th>
              {columns.includes("winRate") && <th className="px-4 py-3">Win Rate</th>}
              {columns.includes("pickRate") && <th className="px-4 py-3">Pick Rate</th>}
            </tr>
          </thead>
        )}
        <tbody>
          {limitedData?.map((row, index) => (
            <tr
              key={row.item_id}
              className="bg-gray-900 rounded-lg shadow border border-gray-800 hover:bg-gray-800 transition-all duration-200 text-center"
            >
              <td className="px-4 py-3 align-middle font-semibold">{index + 1}</td>
              <td className="px-4 py-3 align-middle">
                <div className="flex items-center gap-3 text-left">
                  <ItemImage itemId={row.item_id} />
                  <ItemName itemId={row.item_id} />
                </div>
              </td>
              {columns.includes("winRate") && (
                <td
                  className="px-4 py-3 align-middle"
                  title={`${row.wins.toLocaleString()} wins / ${row.matches.toLocaleString()} matches`}
                >
                  <ProgressBarWithLabel
                    min={0}
                    max={row.matches}
                    value={row.wins}
                    color={"#ff00ff"}
                    label={`${(Math.round((row.wins / row.matches) * 100 * 100) / 100).toFixed(2)}% `}
                  />
                </td>
              )}
              {columns.includes("pickRate") && (
                <td
                  className="px-4 py-3 align-middle"
                  title={`${row.matches.toLocaleString()} matches / ${maxMatches.toLocaleString()} total matches`}
                >
                  <ProgressBarWithLabel
                    min={0}
                    max={maxMatches}
                    value={row.matches}
                    color={"#00ffff"}
                    label={`${(Math.round((row.matches / sumMatches) * 100 * 100) / 100).toFixed(2)}% `}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
