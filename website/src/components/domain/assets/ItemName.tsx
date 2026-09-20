import { Link } from "@tanstack/react-router";
import type { Upgrade } from "deadlock_api_client";
import { memo } from "react";

import { EntityName, type EntityNameProps } from "~/components/domain/assets/EntityName";
import type { ItemSource } from "~/components/domain/assets/ItemImage";
import { useItemById } from "~/hooks/useAssetById";
import { itemSlug } from "~/lib/item-slug";

type ItemNameLook = Omit<EntityNameProps, "name" | "loading" | "link" | "size"> & {
  /** Links the name to the item's analytics page. */
  linkToDetail?: boolean;
};

/** Pass `item` to render an item already read by the parent without another query subscription. */
export const ItemName = memo(function ItemName(props: ItemNameLook & ItemSource) {
  return props.itemId !== undefined ? <ItemNameById {...props} /> : <ItemNameView {...props} />;
});

function ItemNameById({ itemId, ...props }: ItemNameLook & { itemId: number }) {
  const { item, isLoading } = useItemById(itemId);
  return <ItemNameView {...props} item={item} loading={isLoading} />;
}

function ItemNameView({
  item,
  linkToDetail = false,
  ...props
}: ItemNameLook & { item: Upgrade | undefined; loading?: boolean }) {
  return (
    <EntityName
      name={item?.name ?? "Unknown Item"}
      size="default"
      link={
        linkToDetail && item ? (
          <Link to="/analytics/items/$itemName" params={{ itemName: itemSlug(item.name) }} preload="intent" />
        ) : undefined
      }
      {...props}
    />
  );
}
