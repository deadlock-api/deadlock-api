import type { RankV2 } from "assets-deadlock-api-client";
import type { MapV1 } from "assets-deadlock-api-client/api";
import { CircleQuestionMark } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { extractBadgeMap } from "~/lib/leaderboard";
import { cn } from "~/lib/utils";

export interface MapImageProps {
	map: MapV1;
}

export default function MapImage({
	map,
	className,
	...props
}: MapImageProps & React.ComponentProps<"img">) {
	const altText = "Map Image";

	return (
		<img
			src={map.images.minimap}
			alt={altText}
			className={cn("rounded-md select-none pointer-events-none", className)}
			{...props}
		/>
	);
}
