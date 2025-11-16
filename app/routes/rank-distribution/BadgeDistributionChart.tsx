import type { RankV2 } from "assets-deadlock-api-client";
import type { BadgeDistribution } from "deadlock-api-client";
import { useCallback, useMemo } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Label,
	XAxis,
	YAxis,
} from "recharts";
import { ChartContainer } from "~/components/ui/chart";
import { range } from "~/lib/utils";

export default function BadgeDistributionChart({
	badgeDistributionData,
	ranksData,
}: {
	badgeDistributionData: BadgeDistribution[];
	ranksData: RankV2[];
}) {
	const tierData = useMemo(() => {
		const map = new Map<number, RankV2>();
		ranksData.forEach((r) => {
			map.set(r.tier, r);
		});
		return map;
	}, [ranksData]);

	const matchePerBadge = useMemo(() => {
		const map = new Map<number, number>();
		badgeDistributionData.forEach((item) => {
			map.set(item.badge_level, item.total_matches ?? 0);
		});
		return map;
	}, [badgeDistributionData]);

	const chartData = useMemo(() => {
		const badges = badgeDistributionData.map((item) => item.badge_level);
		if (badges.length === 0) return [];
		const [minBadge, maxBadge] = [Math.min(...badges), Math.max(...badges)];
		return range(minBadge, maxBadge).map((badge) => ({
			badge,
			tier: Math.floor(badge / 10),
			matches: matchePerBadge.get(badge) ?? 0,
		}));
	}, [badgeDistributionData, matchePerBadge]);
	const ticks = useMemo(() => {
		const badges = badgeDistributionData.map((item) => item.badge_level);
		if (badges.length === 0) return [];
		const [minBadge, maxBadge] = [Math.min(...badges), Math.max(...badges)];
		return range(minBadge, maxBadge, 10);
	}, [badgeDistributionData]);
	const xAxisTickFormatter = useCallback(
		(badge: number) => tierData.get(Math.floor(badge / 10))?.name ?? "",
		[tierData],
	);

	return (
		<ChartContainer
			config={{ matches: { label: "Matches" } }}
			className="h-full w-full"
		>
			<BarChart accessibilityLayer data={chartData}>
				<CartesianGrid vertical={false} />
				<Bar dataKey="matches" fill="var(--color-accent)" radius={4}>
					{chartData.map((entry) => (
						<Cell
							key={`cell-${entry.badge}`}
							fill={tierData.get(entry.tier)?.color ?? "var(--color-accent)"}
						/>
					))}
				</Bar>
				<XAxis
					dataKey="badge"
					tickLine={false}
					minTickGap={0}
					ticks={ticks}
					textAnchor="start"
					tickFormatter={xAxisTickFormatter}
				/>
				<YAxis dataKey="matches" tickCount={4} textAnchor="end">
					<Label value="Matches" position="middle" textAnchor={"middle"} />
				</YAxis>
			</BarChart>
		</ChartContainer>
	);
}
