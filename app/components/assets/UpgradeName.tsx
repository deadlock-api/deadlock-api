import type { UpgradeV2 } from "assets-deadlock-api-client";
import type React from "react";
import { cn } from "~/lib/utils";

export default function UpgradeName({
  itemId,
  itemAssets,
  props,
}: {
  itemId: number;
  itemAssets: UpgradeV2[];
  props?: React.ImgHTMLAttributes<HTMLSpanElement>;
}) {
  const item = itemAssets.find((item) => item.id === itemId);

  return (
    <span {...props} className={cn("truncate", props?.className)}>
      {item?.name ?? "Unknown Item"}
    </span>
  );
}
