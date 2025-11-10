import { useQueries, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { LoadingWithDescription } from "~/components/LoadingWithDescription";
import { api } from "~/services/api";
import { assetsApi } from "~/services/assets-api";
import BadgeDistributionChart from "./BadgeDistributionChart";

export function meta() {
	return [
		{ title: "Deadlock API" },
		{ name: "description", content: "Deadlock API" },
	];
}

export default function RankDistribution() {
	const [ranksQuery, badgeDistributionQuery] = useQueries({
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
				queryKey: ["rankDistribution"],
				queryFn: async () => {
					const response = await api.analytics_api.badgeDistribution();
					return response.data;
				},
				staleTime: 24 * 60 * 60 * 1000, // 24 hours
			},
		],
	});

	const ranksData = ranksQuery?.data ?? [];
	const badgeDistributionData = badgeDistributionQuery?.data;
	const isPending =
		badgeDistributionQuery?.isPending || ranksQuery?.isPending || false;
	const isError =
		badgeDistributionQuery?.isError || ranksQuery?.isError || false;
	return (
		<div className="space-y-8 max-h-xl">
			<section className="space-y-4 max-h-xl">
				<h1 className="text-center text-4xl">Match Rank Distribution</h1>
				<div className="h-200 flex flex-1 justify-center items-center">
					{isPending ? (
						<div className="flex items-center justify-center py-8">
							<LoadingWithDescription description="Loading rank distribution..." />
						</div>
					) : isError ? (
						<div className="text-center text-sm text-red-600 py-8">
							Failed to load rank distribution.
						</div>
					) : badgeDistributionData ? (
						<BadgeDistributionChart
							badgeDistributionData={badgeDistributionData}
							ranksData={ranksData}
						/>
					) : null}
				</div>
			</section>
		</div>
	);
}
