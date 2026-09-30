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
 * The corrupted version of a shop item. The game has no art of its own for it: the item's icon on the Broker's card,
 * as the shop draws it, cropped to a square box. The frame is the game's own art and looks the same in every theme. The icon's alt text
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
      // One fixed cell (`minmax(0, 1fr)`), so both layers take the box's size rather than their own: the frame art is a
      // tall card with far more pixels than any box it is drawn in, and in an auto-sized cell it overflowed the page.
      className={cn(
        "inline-grid size-8 shrink-0 grid-cols-1 grid-rows-1 place-items-center overflow-hidden rounded-sm **:col-start-1 **:row-start-1",
        className,
      )}
      {...props}
    >
      {/* The Broker's card behind, cropped to the square; the icon on top, inset so the card shows around it. Until
          the art has loaded the plain icon stands alone at full size. (A <picture> is `display: contents`, so its
          <img> is the cell item.) */}
      {art && (
        <AssetImage
          asset={{ webp: art.webp, png: art.png, alt: "" }}
          className="pointer-events-none size-full object-cover"
        />
      )}
      <ItemImage item={item} loading={loading} alt={label} title="" className={art ? "size-3/4" : "size-full"} />
    </span>
  );
}
