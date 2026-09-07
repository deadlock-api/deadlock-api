import { ItemImageFromAsset } from "~/components/ItemImage";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { formatMatchDuration } from "~/lib/tracker/compute";
import { cn } from "~/lib/utils";
import type { SlimUpgrade } from "~/queries/asset-queries";
import type { TrackerMatchItem } from "~/queries/tracker-queries";

/** Every shop purchase in order, including items sold later. Ability upgrades share the list and are dropped. */
export function BuildOrderStrip({
  items,
  itemsById,
}: {
  items: TrackerMatchItem[];
  itemsById: Map<number, SlimUpgrade>;
}) {
  const purchases = items
    .filter((item) => itemsById.has(item.item_id))
    .toSorted((a, b) => a.game_time_s - b.game_time_s)
    .map((item) => ({ item, upgrade: itemsById.get(item.item_id) as SlimUpgrade }));
  if (purchases.length === 0) return null;
  const spent = purchases.reduce((sum, purchase) => sum + (purchase.upgrade.cost ?? 0), 0);

  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-sm font-semibold">Build order</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {purchases.length} {purchases.length === 1 ? "item" : "items"} · {spent.toLocaleString("en-US")} souls spent
        </span>
      </div>
      <div className="flex flex-wrap gap-x-1 gap-y-2">
        {purchases.map(({ item, upgrade }) => {
          const sold = item.sold_time_s > 0;
          return (
            <Tooltip key={`${item.item_id}-${item.game_time_s}`}>
              <TooltipTrigger asChild>
                <div className="flex w-9 flex-col items-center gap-0.5">
                  <ItemImageFromAsset
                    item={upgrade}
                    className={cn("size-7 rounded-sm", sold && "opacity-35 grayscale")}
                  />
                  <span className="text-[10px] leading-none text-muted-foreground tabular-nums">
                    {formatMatchDuration(item.game_time_s)}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {upgrade.name}
                {upgrade.cost != null && ` · ${upgrade.cost.toLocaleString("en-US")} souls`}
                {sold && ` · sold at ${formatMatchDuration(item.sold_time_s)}`}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
