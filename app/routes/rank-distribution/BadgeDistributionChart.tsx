import type { RankV2 } from "assets-deadlock-api-client";
import type { BadgeDistribution } from "deadlock-api-client";
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
	const tierData = new Map<number, RankV2>();
	ranksData.forEach((r) => {
		tierData.set(r.tier, r);
	});

	const matchePerBadge = new Map<number, number>();
	badgeDistributionData.forEach((item) => {
		matchePerBadge.set(item.badge_level, item.total_matches ?? 0);
	});

	const badges = badgeDistributionData.map((item) => item.badge_level);
	const [minBadge, maxBadge] = [Math.min(...badges), Math.max(...badges)];
	const chartData = range(minBadge, maxBadge).map((badge) => ({
		badge,
		tier: Math.floor(badge / 10),
		matches: matchePerBadge.get(badge) ?? 0,
	}));
	const ticks = range(minBadge, maxBadge, 10);
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
					tickFormatter={(badge) =>
						tierData.get(Math.floor(badge / 10))?.name ?? ""
					}
				/>
				<YAxis dataKey="matches" tickCount={4} textAnchor="end">
					<Label value="Matches" position="middle" textAnchor={"middle"} />
				</YAxis>
			</BarChart>
		</ChartContainer>
	);
}
