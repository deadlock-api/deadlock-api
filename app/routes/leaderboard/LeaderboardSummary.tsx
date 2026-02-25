import type { RankV2 } from "assets_deadlock_api_client";
import type { Leaderboard } from "deadlock_api_client";
import { useMemo } from "react";
import BadgeImage from "~/components/BadgeImage";
import { extractBadgeMap } from "~/lib/leaderboard";

export interface LeaderboardSummaryProps {
	ranks: RankV2[];
	leaderboard: Leaderboard;
	onBadgeClick?: (rank: number) => void;
}

export function LeaderboardSummary({
	ranks,
	leaderboard,
	onBadgeClick,
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
					<button
						key={badge}
						type="button"
						onClick={() => onBadgeClick?.(rank)}
						className="flex flex-col items-center justify-center px-2 py-1 rounded-md bg-slate-800 cursor-pointer hover:bg-slate-700 transition-colors"
					>
						<BadgeImage
							badge={badge}
							ranks={ranks}
							imageType="small"
							className="size-8"
						/>
						<div className="text-lg font-semibold">#{rank}</div>
					</button>
				);
			})}
		</div>
	);
}
