import type { HeroV2, RankV2 } from "assets-deadlock-api-client";
import type React from "react";
import { cn } from "~/lib/utils";

export interface BadgeNameProps {
	badge: number;
	ranks: RankV2[];
}

export default function BadgeName({
	badge,
	ranks,
	className,
	...props
}: BadgeNameProps & React.ComponentProps<"span">) {
	const tier = Math.floor(badge / 10);
	const subtier = badge % 10;
	const rank = ranks.find((rank) => rank.tier === tier);

	return (
		<span {...props} className={cn("truncate", className)} {...props}>
			{rank?.name ?? "Unknown Badge"} {subtier}
		</span>
	);
}
