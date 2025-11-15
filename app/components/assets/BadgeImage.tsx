import type { RankV2 } from "assets-deadlock-api-client";
import { CircleQuestionMark } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { extractBadgeMap } from "~/lib/leaderboard";
import { cn } from "~/lib/utils";

export interface BadgeImageProps {
	badgeLevel: number;
	ranks: RankV2[];
	imageType?: "small" | "large";
}

export default function BadgeImage({
	badgeLevel,
	ranks,
	imageType = "small",
	className,
	...props
}: BadgeImageProps & React.ComponentProps<"img">) {
	const badgeMap = extractBadgeMap(ranks);
	const badgeInfo = badgeMap.get(badgeLevel);
	const [isError, setIsError] = useState(!badgeInfo);

	if (isError || !badgeInfo) {
		return (
			<div
				className={cn(
					"flex items-center justify-center bg-muted rounded-md",
					className,
				)}
			>
				<CircleQuestionMark className="size-1/2 text-muted-foreground" />
			</div>
		);
	}

	const png = badgeInfo[`${imageType}`];
	const webp = badgeInfo[`${imageType}_webp`];
	const altText = `${badgeInfo.name} ${badgeInfo.subtier}`;

	return (
		<picture>
			{webp && <source srcSet={webp} type="image/webp" />}
			{png && <source srcSet={png} type="image/png" />}
			<img
				src={webp ?? png ?? ""}
				alt={altText}
				title={altText}
				className={cn("object-contain", className)}
				onError={() => setIsError(true)}
				{...props}
			/>
		</picture>
	);
}
