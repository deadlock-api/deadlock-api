import { useQuery } from "@tanstack/react-query";

import { AssetImage } from "~/components/domain/assets/AssetImage";
import { ItemImage, type ItemSource } from "~/components/domain/assets/ItemImage";
import { useItemById } from "~/hooks/useAssetById";
import { cn } from "~/lib/utils";
import { corruptionQueryOptions, type SlimUpgrade } from "~/queries/asset-queries";

type CorruptedItemImageProps = Omit<React.ComponentProps<"span">, "children"> & {
  /** `frame` is the shop's corrupted frame; `active` its lit version, for the item a view is about. */
  frame?: "frame" | "active";
};

/**
 * The corrupted version of a shop item. The game has no art of its own for it: the item's icon inside the Broker's
 * frame, as the shop draws it. The frame is the game's own art and looks the same in every theme. The icon's alt text
 * is "Corrupted <item>" and the frame is decorative. Size it with a `size-*` class (32px by default).
 */
export function CorruptedItemImage(props: CorruptedItemImageProps & ItemSource) {
  return props.itemId !== undefined ? <CorruptedItemImageById {...props} /> : <CorruptedItemImageView {...props} />;
}

function CorruptedItemImageById({ itemId, ...props }: CorruptedItemImageProps & { itemId: number }) {
  const { item, isLoading } = useItemById(itemId);
  return <CorruptedItemImageView {...props} item={item} loading={isLoading} />;
}

function CorruptedItemImageView({
  item,
  loading = false,
  frame = "frame",
  className,
  ...props
}: CorruptedItemImageProps & { item: SlimUpgrade | undefined; loading?: boolean }) {
  const { data } = useQuery(corruptionQueryOptions);
  const art = frame === "active" ? data?.images?.frame_active : data?.images?.frame;
  const label = `Corrupted ${item?.name ?? "item"}`;
  return (
    <span
      data-slot="corrupted-item-image"
      data-frame={frame}
      title={label}
      className={cn("inline-grid size-8 shrink-0 **:col-start-1 **:row-start-1", className)}
      {...props}
    >
      <ItemImage item={item} loading={loading} alt={label} title="" className="size-full" />
      {/* Both layers share the one grid cell (a <picture> is `display: contents`, so its <img> is the cell item). Until
          the frame art has loaded the plain icon stands alone, the same size. */}
      {art && (
        <AssetImage asset={{ webp: art.webp, png: art.png, alt: "" }} className="pointer-events-none size-full" />
      )}
    </span>
  );
}
