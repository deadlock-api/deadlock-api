import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { AssetsRank } from "~/types/assets_rank";

export default function RankSelector({
  onRankSelected,
  selectedRank,
  label,
}: { onRankSelected: (selectedRank: number) => void; selectedRank?: number | null; label?: string }) {
  const { data } = useQuery<AssetsRank[]>({
    queryKey: ["assets-ranks"],
    queryFn: () => fetch("https://assets.deadlock-api.com/v2/ranks").then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const ranksSorted = useMemo(() => data?.sort((a, b) => a.tier - b.tier) ?? [], [data]);

  return (
    <div className="max-w-60 flex-1">
      <label htmlFor="rank-select" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
        {label || "Select Rank"}
      </label>
      <select
        id="rank-select"
        onChange={(e) => onRankSelected(Number(e.target.value))}
        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
        value={selectedRank || ""}
      >
        {ranksSorted?.map((rank) => (
          <option key={rank.tier} value={rank.tier}>
            {rank.name}
          </option>
        ))}
      </select>
    </div>
  );
}
