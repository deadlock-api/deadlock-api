import { useQueries } from "@tanstack/react-query";
import type { AnalyticsApiBadgeDistributionRequest } from "deadlock-api-client/api";
import { useQueryState } from "nuqs";
import { LoadingWithDescription } from "~/components/primitives/LoadingWithDescription";
import { Card, CardContent } from "~/components/ui/card";
import { parseAsAnyJson } from "~/lib/utils";
import BadgeDistributionFilter from "~/routes/rank-distribution/BadgeDistributionFilter";
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
	const [filter, setFilter] =
		useQueryState<AnalyticsApiBadgeDistributionRequest>(
			"badge-distribution-filter",
			parseAsAnyJson<AnalyticsApiBadgeDistributionRequest>().withDefault({}),
		);

	const [ranks, badgeDistributionQuery] = useQueries({
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
				queryKey: ["rankDistribution", filter],
				queryFn: async () => {
					const response = await api.analytics_api.badgeDistribution(filter);
					return response.data;
				},
				staleTime: 24 * 60 * 60 * 1000, // 24 hours
			},
		],
	});

	const isPending = badgeDistributionQuery?.isPending || ranks?.isPending;
	const isError = badgeDistributionQuery?.isError || ranks?.isError;
	const error = badgeDistributionQuery?.error || ranks?.error;
	return (
		<div className="space-y-8">
			<section className="space-y-4 max-h-xl">
				<h1 className="text-center text-4xl">Match Rank Distribution</h1>
				<Card>
					<CardContent className="p-4">
						<BadgeDistributionFilter value={filter} onChange={setFilter} />
					</CardContent>
				</Card>
				<div className="h-200 flex justify-center items-center">
					{isPending ? (
						<div className="flex items-center justify-center py-8">
							<LoadingWithDescription description="Loading rank distribution..." />
						</div>
					) : isError ? (
						<div className="text-center text-sm text-red-600 py-8">
							Failed to load rank distribution: {error?.message}
						</div>
					) : badgeDistributionQuery.data ? (
						<BadgeDistributionChart
							badgeDistributionData={badgeDistributionQuery.data}
							ranksData={ranks.data ?? []}
						/>
					) : null}
				</div>
			</section>
		</div>
	);
}
