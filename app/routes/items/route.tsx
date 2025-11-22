import { useQueries } from "@tanstack/react-query";
import type { UpgradeV2 } from "assets-deadlock-api-client/api";
import { ItemTierV2 } from "assets-deadlock-api-client/api";
import { endOfDay, getUnixTime, startOfDay, subDays } from "date-fns";
import { type AnalyticsApiItemStatsRequest } from "deadlock-api-client";
import { useState } from "react";
import { LoadingWithDescription } from "~/components/primitives/LoadingWithDescription";
import { Card, CardContent } from "~/components/ui/card";
import { ItemStatsTable } from "~/routes/items/ItemStatsTable";
import { ItemsFilter } from "~/routes/items/ItemsFilter";
import { api } from "~/services/api";
import { assetsApi } from "~/services/assets-api";

export function meta() {
	return [
		{ title: "Deadlock API" },
		{ name: "description", content: "Deadlock API" },
	];
}

export default function Items() {
	const [filter, setFilter] = useState<
		AnalyticsApiItemStatsRequest & { tierIds?: ItemTierV2[] }
	>({
		minAverageBadge: 91,
		maxAverageBadge: 116,
		minUnixTimestamp: getUnixTime(startOfDay(subDays(new Date(), 30))),
		maxUnixTimestamp: getUnixTime(endOfDay(new Date())),
	});

	const [ranks, heroes, upgradeAssets, itemStats] = useQueries({
		queries: [
			{
				queryKey: ["ranks"],
				queryFn: async () => {
					const response = await assetsApi.default_api.getRanksV2RanksGet();
					return response.data;
				},
				staleTime: Number.MAX_SAFE_INTEGER,
			},
			{
				queryKey: ["heroes"],
				queryFn: async () => {
					const response = await assetsApi.heroes_api.getHeroesV2HeroesGet({
						onlyActive: true,
					});
					return response.data;
				},
				staleTime: Number.MAX_SAFE_INTEGER,
			},
			{
				queryKey: ["upgrades"],
				queryFn: async () => {
					const response =
						await assetsApi.items_api.getItemsByTypeV2ItemsByTypeTypeGet({
							type: "upgrade",
						});
					return response.data as UpgradeV2[];
				},
				staleTime: Number.MAX_SAFE_INTEGER,
			},
			{
				queryKey: ["itemStatsData", filter],
				queryFn: async () => {
					const response = await api.analytics_api.itemStats(filter);
					return response.data;
				},
				staleTime: 60 * 60 * 1000, // 1 hour
			},
		],
	});

	const isPending =
		heroes?.isPending ||
		ranks?.isPending ||
		itemStats?.isPending ||
		upgradeAssets?.isPending;
	const isError =
		heroes?.isError ||
		ranks?.isError ||
		itemStats?.isError ||
		upgradeAssets?.isError;
	const error =
		heroes.error || ranks?.error || itemStats?.error || upgradeAssets?.error;
	if (!ranks) return null;
	return (
		<div className="space-y-8">
			<section className="space-y-4 max-h-xl">
				<h1 className="text-center text-4xl">Items</h1>
				<Card>
					<CardContent className="p-4">
						<ItemsFilter
							ranks={ranks.data ?? []}
							heroes={heroes.data ?? []}
							value={filter}
							onChange={setFilter}
						/>
					</CardContent>
				</Card>
				<div className="min-h-200 w-full mx-auto">
					{isPending ? (
						<div className="flex items-center justify-center py-8">
							<LoadingWithDescription description="Loading item stats..." />
						</div>
					) : isError ? (
						<div className="text-center text-sm text-red-600 py-8">
							Failed to load item stats: {error?.message}
						</div>
					) : itemStats.data ? (
						<ItemStatsTable
							upgradeAssets={upgradeAssets.data ?? []}
							itemStats={itemStats.data}
							tierIds={filter.tierIds}
						/>
					) : null}
				</div>
			</section>
		</div>
	);
}
