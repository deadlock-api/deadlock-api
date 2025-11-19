import { useQueries } from "@tanstack/react-query";
import { LeaderboardRegionEnum } from "deadlock-api-client";
import { useCallback, useState } from "react";
import { LoadingWithDescription } from "~/components/primitives/LoadingWithDescription";
import { Card, CardContent } from "~/components/ui/card";
import {
	LeaderboardFilter,
	type LeaderboardFilterType,
} from "~/routes/leaderboard/LeaderboardFilter";
import { LeaderboardSummary } from "~/routes/leaderboard/LeaderboardSummary";
import { LeaderboardTable } from "~/routes/leaderboard/LeaderboardTable";
import { api } from "~/services/api";
import { assetsApi } from "~/services/assets-api";

export function meta() {
	return [
		{ title: "Deadlock API" },
		{ name: "description", content: "Deadlock API" },
	];
}

export default function Leaderboard() {
	const [filter, setFilter] = useState<LeaderboardFilterType>({
		region: LeaderboardRegionEnum.Europe,
	});

	const [ranks, heroes, leaderboardQuery] = useQueries({
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
				queryKey: ["leaderboardData", filter],
				queryFn: async () => {
					const response =
						"heroId" in filter && filter.heroId
							? await api.leaderboard_api.leaderboardHero(filter)
							: await api.leaderboard_api.leaderboard(filter);
					return response.data;
				},
				staleTime: 60 * 60 * 1000, // 1 hour
			},
		],
	});

	const isPending =
		heroes?.isPending || ranks?.isPending || leaderboardQuery?.isPending;
	const isError =
		heroes?.isError || ranks?.isError || leaderboardQuery?.isError;
	const error = heroes.error || ranks?.error || leaderboardQuery?.error;

	const handleHeroClick = useCallback((heroId: number) => {
		setFilter((prevFilter) => ({
			...prevFilter,
			heroId: heroId,
		}));
	}, []);

	return (
		<div className="space-y-8">
			<section className="space-y-4">
				<h1 className="text-center text-4xl">Leaderboard</h1>
				<Card>
					<CardContent className="p-4">
						<LeaderboardFilter
							heroes={heroes.data ?? []}
							value={filter}
							onChange={setFilter}
						/>
					</CardContent>
				</Card>
				<div className="min-h-200 max-w-200 mx-auto">
					{isPending ? (
						<div className="flex items-center justify-center py-8">
							<LoadingWithDescription description="Loading leaderboard..." />
						</div>
					) : isError ? (
						<div className="text-center text-sm text-red-600 py-8">
							Failed to load leaderboard: {error?.message}
						</div>
					) : leaderboardQuery.data ? (
						<>
							<LeaderboardSummary
								ranks={ranks.data}
								leaderboard={leaderboardQuery.data}
							/>
							<LeaderboardTable
								ranks={ranks.data ?? []}
								heroes={heroes.data ?? []}
								leaderboard={leaderboardQuery.data}
								onHeroClick={handleHeroClick}
							/>
						</>
					) : null}
				</div>
			</section>
		</div>
	);
}
