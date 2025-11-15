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

	const badgeStartingRanks = useMemo(() => {
		const ranksByBadge = new Map<number, number>();
		leaderboard.entries.forEach((entry) => {
			if (
				entry.badge_level &&
				!ranksByBadge.has(entry.badge_level) &&
				entry.rank
			) {
				ranksByBadge.set(entry.badge_level, entry.rank);
			}
		});
		return new Map([...ranksByBadge.entries()].sort((a, b) => b[0] - a[0]));
	}, [leaderboard]);

	if (badgeStartingRanks.size === 0) {
		return null;
	}

	return (
		<div className="grid grid-cols-[repeat(auto-fit,minmax(60px,1fr))] gap-2">
			{Array.from(badgeStartingRanks.entries()).map(([badge, rank]) => {
				const badgeInfo = badgeMap.get(badge);
				if (!badgeInfo) return null;

				return (
					<div
						key={badge}
						className="flex flex-col items-center justify-center px-2 py-1 rounded-md bg-slate-800"
					>
						<BadgeImage
							badge={badge}
							ranks={ranks}
							imageType="small"
							className="size-8"
						/>
						<div className="text-lg font-semibold">#{rank}</div>
					</div>
				);
			})}
		</div>
	);
}
