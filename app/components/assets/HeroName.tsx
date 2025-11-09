import type { HeroV2 } from "assets-deadlock-api-client";
import type React from "react";
import { cn } from "~/lib/utils";

export default function HeroName({
  heroId,
  heroAssets,
  props,
}: {
  heroId: number;
  heroAssets: HeroV2[];
  props?: React.ImgHTMLAttributes<HTMLSpanElement>;
}) {
  const hero = heroAssets.find((hero) => hero.id === heroId);

  return (
    <span {...props} className={cn("truncate", props?.className)}>
      {hero?.name ?? "Unknown Hero"}
    </span>
  );
}
