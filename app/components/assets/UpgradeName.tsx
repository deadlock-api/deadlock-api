import type { UpgradeV2 } from "assets-deadlock-api-client";
import type React from "react";
import { cn } from "~/lib/utils";

export interface UpgradeNameProps {
	upgradeId: number;
	upgradeAssets: UpgradeV2[];
}

export default function UpgradeName({
	upgradeId,
	upgradeAssets,
	className,
	...props
}: UpgradeNameProps & React.ComponentProps<"span">) {
	const item = upgradeAssets.find((item) => item.id === upgradeId);

	return (
		<span {...props} className={cn("truncate", className)}>
			{item?.name ?? "Unknown Item"}
		</span>
	);
}
