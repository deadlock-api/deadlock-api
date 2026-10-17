import { ItemImage } from "~/components/domain/assets/ItemImage";
import { Skeleton } from "~/components/ui/skeleton";
import { useItemById } from "~/hooks/useAssetById";
import type { BuildItemUsage } from "~/lib/build-stats";
import { formatPercent, formatShare } from "~/lib/format";

/** Below this share of the build's matches an item is drawn dimmed: listed, but seldom bought. */
const RARELY_BOUGHT = 0.25;

function clock(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** One item of a build with how often the build's players bought it, under the icon. */
export function BuildItemTile({
  itemId,
  usage,
  pending,
}: {
  itemId: number;
  /** Undefined when nobody on the build bought it, or while the purchases load (`pending`). */
  usage: BuildItemUsage | undefined;
  pending: boolean;
}) {
  const { item } = useItemById(itemId);
  const name = item?.name ?? "Item";
  const details = usage
    ? `${name}: bought in ${formatShare(usage.boughtRate)} of the build's matches, at ${clock(usage.avgBuyTimeS)} on average, ${formatPercent(usage.winRate)} wins`
    : pending
      ? name
      : `${name}: not bought by the build's players`;
  const rate = usage?.boughtRate ?? 0;
  return (
    <div className="flex w-10 flex-col items-center gap-0.5" title={details}>
      <ItemImage
        item={item}
        // The tile's own text names the item and says how often it was bought.
        alt=""
        title=""
        emphasis={!pending && rate < RARELY_BOUGHT ? "dim" : "normal"}
        className="size-9"
      />
      {pending ? (
        <Skeleton className="h-4 w-8" />
      ) : (
        <span aria-hidden="true" className="text-xs text-muted-foreground tabular-nums">
          {formatShare(rate)}
        </span>
      )}
      <span className="sr-only">{details}</span>
    </div>
  );
}
