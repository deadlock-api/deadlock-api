import type { Rank } from "deadlock_api_client";
import { CircleQuestionMark } from "lucide-react";
import type React from "react";
import { memo, useMemo, useState } from "react";

import { Skeleton } from "~/components/ui/skeleton";
import { extractBadgeMap } from "~/lib/leaderboard";
import { cn } from "~/lib/utils";

export interface BadgeImageProps {
  badge: number;
  ranks: Rank[];
  /**
   * `inline` sits in a table row or a line of text without growing it: a 24px badge on a box one line-height tall,
   * where `className` lands. `default` takes its size from `className`.
   */
  size?: "default" | "inline";
}

export const BadgeImage = memo(function BadgeImage({
  badge,
  ranks,
  size = "default",
  className,
  ...props
}: BadgeImageProps & React.ComponentProps<"img">) {
  const badgeMap = useMemo(() => extractBadgeMap(ranks), [ranks]);
  const badgeInfo = ranks.length ? badgeMap.get(badge) : undefined;
  const src = badgeInfo?.large_webp ?? badgeInfo?.large ?? "";
  // The failure belongs to one URL, so ranks that arrive later or a new badge start clean.
  const [failedSrc, setFailedSrc] = useState<string>();
  const look = size === "inline" ? "size-6 max-w-none" : className;
  const altText = badgeInfo ? `${badgeInfo.name} ${badgeInfo.subtier}` : undefined;

  const art = !ranks.length ? (
    <Skeleton className={cn("size-8 rounded-md", look)} />
  ) : !badgeInfo || failedSrc === src ? (
    <div data-slot="badge-image" className={cn("flex items-center justify-center rounded-md bg-muted", look)}>
      <CircleQuestionMark className="size-1/2 text-muted-foreground" />
    </div>
  ) : (
    <picture className="contents">
      {badgeInfo.large_webp && <source className="hidden" srcSet={badgeInfo.large_webp} type="image/webp" />}
      {badgeInfo.large && <source className="hidden" srcSet={badgeInfo.large} type="image/png" />}
      <img
        data-slot="badge-image"
        src={src}
        alt={altText}
        title={altText}
        className={cn("object-contain", look)}
        onError={() => setFailedSrc(src)}
        {...props}
      />
    </picture>
  );

  if (size !== "inline") return art;

  return (
    // One line tall, so the row keeps its height; the art is centred on it and overflows by a few pixels each way.
    <span
      data-slot="badge-image-inline"
      className={cn("relative inline-block h-lh w-6 shrink-0 align-middle", className)}
    >
      <span className="absolute inset-x-0 top-1/2 flex -translate-y-1/2">{art}</span>
    </span>
  );
});
