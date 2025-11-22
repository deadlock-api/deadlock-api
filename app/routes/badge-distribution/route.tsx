import { useQueries } from "@tanstack/react-query";
import { endOfDay, getUnixTime, startOfDay, subDays } from "date-fns";
import type { AnalyticsApiBadgeDistributionRequest } from "deadlock-api-client/api";
import { useState } from "react";
import { LoadingWithDescription } from "~/components/primitives/LoadingWithDescription";
import { Card, CardContent } from "~/components/ui/card";
import BadgeDistributionFilter from "~/routes/badge-distribution/BadgeDistributionFilter";
import { api } from "~/services/api";
import { assetsApi } from "~/services/assets-api";
import BadgeDistributionChart from "./BadgeDistributionChart";

export function meta() {
	return [
		{ title: "Deadlock API" },
		{ name: "description", content: "Deadlock API" },
	];
}

export default function BadgeDistribution() {
	const [filter, setFilter] = useState<AnalyticsApiBadgeDistributionRequest>({
		minUnixTimestamp: getUnixTime(startOfDay(subDays(new Date(), 30))),
		maxUnixTimestamp: getUnixTime(endOfDay(new Date())),
	});

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
				queryKey: ["badgeDistribution", filter],
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
