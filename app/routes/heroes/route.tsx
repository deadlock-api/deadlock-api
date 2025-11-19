import { useQueries } from "@tanstack/react-query";
import { endOfDay, getUnixTime, startOfDay, subDays } from "date-fns";
import { type AnalyticsApiHeroStatsRequest } from "deadlock-api-client";
import { useState } from "react";
import { LoadingWithDescription } from "~/components/primitives/LoadingWithDescription";
import { Card, CardContent } from "~/components/ui/card";
import { HeroesFilter } from "~/routes/heroes/HeroesFilter";
import { HeroStatsTable } from "~/routes/heroes/HeroStatsTable";
import { api } from "~/services/api";
import { assetsApi } from "~/services/assets-api";

export function meta() {
	return [
		{ title: "Deadlock API" },
		{ name: "description", content: "Deadlock API" },
	];
}

export default function Heroes() {
	const [filter, setFilter] = useState<AnalyticsApiHeroStatsRequest>({
		minAverageBadge: 91,
		maxAverageBadge: 116,
		minUnixTimestamp: getUnixTime(startOfDay(subDays(new Date(), 30))),
		maxUnixTimestamp: getUnixTime(endOfDay(new Date())),
	});

	const [ranks, heroes, heroStats] = useQueries({
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
				queryKey: ["heroStatsData", filter],
				queryFn: async () => {
					const response = await api.analytics_api.heroStats(filter);
					return response.data;
				},
				staleTime: 60 * 60 * 1000, // 1 hour
			},
		],
	});

	const isPending =
		heroes?.isPending || ranks?.isPending || heroStats?.isPending;
	const isError = heroes?.isError || ranks?.isError || heroStats?.isError;
	const error = heroes.error || ranks?.error || heroStats?.error;
	if (!ranks) return null;
	return (
		<div className="space-y-8">
			<section className="space-y-4 max-h-xl">
				<h1 className="text-center text-4xl">Heroes</h1>
				<Card>
					<CardContent className="p-4">
						<HeroesFilter
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
							<LoadingWithDescription description="Loading rank distribution..." />
						</div>
					) : isError ? (
						<div className="text-center text-sm text-red-600 py-8">
							Failed to load hero stats: {error?.message}
						</div>
					) : heroStats.data ? (
						<HeroStatsTable heroes={heroes.data} heroStats={heroStats.data} />
					) : null}
				</div>
			</section>
		</div>
	);
}
