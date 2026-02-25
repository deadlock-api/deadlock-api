import { useQueries } from "@tanstack/react-query";
import { LeaderboardRegionEnum } from "deadlock_api_client";
import { useCallback, useRef, useState } from "react";
import { Spinner } from "~/components/ui/spinner";
import { Card, CardContent } from "~/components/ui/card";
import {
	LeaderboardFilter,
	type LeaderboardFilterType,
} from "~/routes/leaderboard/LeaderboardFilter";
import { LeaderboardSummary } from "~/routes/leaderboard/LeaderboardSummary";
import {
	LeaderboardTable,
	type LeaderboardTableHandle,
} from "~/routes/leaderboard/LeaderboardTable";
import { api } from "~/lib/api";
import { assetsApi } from "~/lib/assets-api";

export function meta() {
	return [
		{ title: "Leaderboard | Deadlock API" },
		{ name: "description", content: "Deadlock ranked leaderboard" },
	];
}

export default function Leaderboard() {
	const [filter, setFilter] = useState<LeaderboardFilterType>({
		region: LeaderboardRegionEnum.Europe,
	});

	const [ranks, leaderboardQuery] = useQueries({
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
				queryKey: ["leaderboardData", filter],
				queryFn: async () => {
					const response =
						"heroId" in filter && filter.heroId
							? await api.leaderboard_api.leaderboardHero(filter)
							: await api.leaderboard_api.leaderboard(filter);
					return response.data;
				},
				staleTime: 60 * 60 * 1000,
			},
		],
	});

	const isPending = ranks?.isPending || leaderboardQuery?.isPending;
	const isError = ranks?.isError || leaderboardQuery?.isError;
	const error = ranks?.error || leaderboardQuery?.error;

	const tableRef = useRef<LeaderboardTableHandle>(null);

	const handleHeroClick = useCallback((heroId: number) => {
		setFilter((prevFilter) => ({
			...prevFilter,
			heroId: heroId,
		}));
	}, []);

	const handleBadgeClick = useCallback((rank: number) => {
		tableRef.current?.jumpToRank(rank);
	}, []);

	return (
		<div className="space-y-8">
			<section className="space-y-4">
				<h2 className="text-3xl font-bold text-center mb-2">Leaderboard</h2>
				<Card className="mb-8 w-fit mx-auto">
					<CardContent>
						<LeaderboardFilter value={filter} onChange={setFilter} />
					</CardContent>
				</Card>
				<div className="min-h-200 max-w-200 mx-auto">
					{isPending ? (
						<div className="flex items-center justify-center gap-2 py-8">
							<Spinner className="size-6" />
							<span className="text-sm text-muted-foreground">Loading leaderboard...</span>
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
								onBadgeClick={handleBadgeClick}
							/>
							<LeaderboardTable
								ref={tableRef}
								ranks={ranks.data ?? []}
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
