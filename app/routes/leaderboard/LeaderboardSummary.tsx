import type { RankV2 } from "assets-deadlock-api-client";
import type { Leaderboard } from "deadlock-api-client";
import { useMemo } from "react";
import BadgeImage from "~/components/assets/BadgeImage";
import { extractBadgeMap } from "~/lib/leaderboard";

export interface LeaderboardSummaryProps {
	ranks: RankV2[];
	leaderboard: Leaderboard;
}

export function LeaderboardSummary({
	ranks,
	leaderboard,
}: LeaderboardSummaryProps) {
	const badgeMap = useMemo(() => extractBadgeMap(ranks), [ranks]);

	const rankCounts = useMemo(() => {
		const counts = new Map<number, number>();
		leaderboard.entries.forEach((entry) => {
			if (entry.badge_level) {
				counts.set(entry.badge_level, (counts.get(entry.badge_level) ?? 0) + 1);
			}
		});
		return new Map([...counts.entries()].sort((a, b) => b[0] - a[0]));
	}, [leaderboard]);

	if (rankCounts.size === 0) {
		return null;
	}

	return (
		<div className="grid grid-cols-[repeat(auto-fit,minmax(63px,1fr))] gap-4">
			{Array.from(rankCounts.entries()).map(([badge, count]) => {
				const badgeInfo = badgeMap.get(badge);
				if (!badgeInfo) return null;

				return (
					<div
						key={badge}
						className="flex flex-col items-center justify-center p-2 rounded-md bg-slate-800"
					>
						<BadgeImage
							badgeLevel={badge}
							ranks={ranks}
							imageType="small"
							className="size-10"
						/>
						<div className="text-lg font-semibold">{count}</div>
					</div>
				);
			})}
		</div>
	);
}
