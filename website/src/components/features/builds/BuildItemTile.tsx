import { MessageSquareText } from "lucide-react";

import { ItemImage } from "~/components/domain/assets/ItemImage";
import { CornerBadge } from "~/components/ui/corner-badge";
import { Skeleton } from "~/components/ui/skeleton";
import { Tooltip, TooltipHeader, TooltipStat, TooltipStats, TooltipTarget } from "~/components/ui/tooltip";
import { useItemById } from "~/hooks/useAssetById";
import type { BuildItemUsage } from "~/lib/build-stats";
import { formatPercent, formatShare } from "~/lib/format";

/** Below this share of the build's matches an item is drawn dimmed: listed, but seldom bought. */
const RARELY_BOUGHT = 0.25;

function clock(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * One item of a build, with how often the build's players bought it under the icon. Its tooltip names the item, holds
 * the author's note on it and the purchases; an item with a note carries a mark in its corner.
 */
export function BuildItemTile({
  itemId,
  usage,
  pending,
  note,
  caption = "rate",
}: {
  itemId: number;
  /** Undefined when nobody on the build bought it, or while the purchases load (`pending`). */
  usage: BuildItemUsage | undefined;
  pending: boolean;
  /** What the build's author wrote about the item. */
  note?: string;
  /** Under the icon: how often it was bought (`rate`), or when on average (`time`). */
  caption?: "rate" | "time";
}) {
  const { item } = useItemById(itemId);
  const name = item?.name ?? "Item";
  const rate = usage?.boughtRate ?? 0;
  return (
    <Tooltip
      content={
        <>
          <TooltipHeader title={name} subtitle={note} />
          {!pending && (
            <TooltipStats>
              <TooltipStat label="Bought in" value={`${formatShare(rate)} of matches`} />
              {usage && <TooltipStat label="Bought at" value={clock(usage.avgBuyTimeS)} />}
              {usage && usage.soldRate > 0 && (
                <TooltipStat
                  label="Sold"
                  value={`${formatShare(usage.soldRate)} of buys, at ${clock(usage.avgSellTimeS)}`}
                />
              )}
              {usage && <TooltipStat label="Win rate when bought" value={formatPercent(usage.winRate)} />}
              {usage && usage.winRateWithout !== null && (
                <TooltipStat label="Win rate without" value={formatPercent(usage.winRateWithout)} />
              )}
            </TooltipStats>
          )}
        </>
      }
    >
      <TooltipTarget aria-label={name} className="flex w-9 flex-col items-center">
        <span className="relative">
          <ItemImage
            item={item}
            // The target names the item; the tooltip says how often it was bought.
            alt=""
            title=""
            emphasis={!pending && rate < RARELY_BOUGHT ? "dim" : "normal"}
            className="size-8"
          />
          {note && (
            // Muted: a build may note nearly every item, and a row of bright marks would outshine the items.
            <CornerBadge tone="muted" aria-hidden="true">
              <MessageSquareText className="size-3" />
            </CornerBadge>
          )}
        </span>
        {pending ? (
          <Skeleton className="h-4 w-8" />
        ) : (
          <span aria-hidden="true" className="text-xs text-muted-foreground tabular-nums">
            {caption === "time" && usage ? clock(usage.avgBuyTimeS) : formatShare(rate)}
          </span>
        )}
      </TooltipTarget>
    </Tooltip>
  );
}
