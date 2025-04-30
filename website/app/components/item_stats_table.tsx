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
  hideIndex,
  sortBy,
}: {
  columns: string[];
  limit?: number;
  hideHeader?: boolean;
  hideIndex?: boolean;
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

  const minWinRate = useMemo(() => Math.min(...(data || []).map((item) => item.wins / item.matches)), [data]);
  const maxWinRate = useMemo(() => Math.max(...(data || []).map((item) => item.wins / item.matches)), [data]);
  const minMatches = useMemo(() => Math.min(...(data || []).map((item) => item.matches)), [data]);
  const maxMatches = useMemo(() => Math.max(...(data || []).map((item) => item.matches)), [data]);
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
              {!hideIndex && <th className="p-3">#</th>}
              <th className="p-3 text-left">Item</th>
              {columns.includes("winRate") && <th className="p-3">Win Rate</th>}
              {columns.includes("usage") && <th className="p-3">Usage</th>}
            </tr>
          </thead>
        )}
        <tbody>
          {limitedData?.map((row, index) => (
            <tr
              key={row.item_id}
              className="bg-gray-900 rounded-lg shadow border border-gray-800 hover:bg-gray-800 transition-all duration-200 text-center"
            >
              {!hideIndex && <td className="p-3 align-middle font-semibold">{index + 1}</td>}
              <td className="p-3 align-middle">
                <div className="flex items-center gap-3 text-left">
                  <ItemImage itemId={row.item_id} />
                  <ItemName itemId={row.item_id} />
                </div>
              </td>
              {columns.includes("winRate") && (
                <td
                  className="p-3 align-middle"
                  title={`${row.wins.toLocaleString()} wins / ${row.matches.toLocaleString()} matches`}
                >
                  <ProgressBarWithLabel
                    min={minWinRate}
                    max={maxWinRate}
                    value={row.wins / row.matches}
                    color={"#ff00ff"}
                    label={`${(Math.round((row.wins / row.matches) * 100 * 100) / 100).toFixed(2)}% `}
                  />
                </td>
              )}
              {columns.includes("usage") && (
                <td className="p-3 align-middle" title={`${row.matches.toLocaleString()} matches`}>
                  <ProgressBarWithLabel
                    min={minMatches}
                    max={maxMatches}
                    value={row.matches}
                    color={"#00ffff"}
                    label={row.matches.toLocaleString()}
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
