import type { HeroV2 } from "assets-deadlock-api-client";
import type { HeroImagesV2 } from "assets-deadlock-api-client/api";
import type React from "react";
import { cn } from "~/lib/utils";

export interface HeroNameProps {
	heroId: number;
	heroes: HeroV2[];
}

export default function HeroName({
	heroId,
	heroes,
	className,
	...props
}: HeroNameProps & React.ComponentProps<"span">) {
	const hero = heroes.find((hero) => hero.id === heroId);

	return (
		<span {...props} className={cn("truncate", className)} {...props}>
			{hero?.name ?? "Unknown Hero"}
		</span>
	);
}
