import { useQueries } from "@tanstack/react-query";
import { endOfDay, getUnixTime, startOfDay, subDays } from "date-fns";
import type { AnalyticsApiKillDeathStatsRequest } from "deadlock-api-client/api";
import { useState } from "react";
import { LoadingWithDescription } from "~/components/primitives/LoadingWithDescription";
import { Card, CardContent } from "~/components/ui/card";
import KillDeathHeatmap from "~/routes/heatmap/KillDeathHeatmap";
import { api } from "~/services/api";
import { assetsApi } from "~/services/assets-api";

export function meta() {
	return [
		{ title: "Deadlock API" },
		{ name: "description", content: "Deadlock API" },
	];
}

export default function Heatmap() {
	const [filter, setFilter] = useState<AnalyticsApiKillDeathStatsRequest>({
		minUnixTimestamp: getUnixTime(startOfDay(subDays(new Date(), 30))),
		maxUnixTimestamp: getUnixTime(endOfDay(new Date())),
		// minGameTimeS: 1800,
		maxGameTimeS: 601,
		accountIds: [74963221],
		team: 1,
	});

	const [map, killDeathStatsQuery] = useQueries({
		queries: [
			{
				queryKey: ["map"],
				queryFn: async () => {
					const response = await assetsApi.default_api.getMapV1MapGet();
					return response.data;
				},
				staleTime: Number.MAX_SAFE_INTEGER,
			},
			{
				queryKey: ["killDeathStats", filter],
				queryFn: async () => {
					const response = await api.analytics_api.killDeathStats(filter);
					return response.data;
				},
				staleTime: 60 * 60 * 1000, // 1 hour
			},
		],
	});

	const isPending = killDeathStatsQuery?.isPending || map?.isPending;
	const isError = killDeathStatsQuery?.isError || map?.isError;
	const error = killDeathStatsQuery?.error || map?.error;
	return (
		<div className="space-y-8">
			<section className="space-y-4">
				<h1 className="text-center text-4xl">Heatmap</h1>
				<Card>
					<CardContent className="p-4">
						<div>TODO: Add filters</div>
					</CardContent>
				</Card>
				<div className="flex justify-center items-center">
					{isPending ? (
						<div className="flex items-center justify-center py-8">
							<LoadingWithDescription description="Loading heatmap..." />
						</div>
					) : isError ? (
						<div className="text-center text-sm text-red-600 py-8">
							Failed to load heatmap data: {error?.message}
						</div>
					) : killDeathStatsQuery.data && map.data ? (
						<KillDeathHeatmap
							killDeathStats={killDeathStatsQuery.data}
							map={map.data}
							team={filter.team}
							values={{ deaths: true }}
						/>
					) : null}
				</div>
			</section>
		</div>
	);
}
