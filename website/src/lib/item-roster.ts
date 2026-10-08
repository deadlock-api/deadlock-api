import type { Upgrade } from "deadlock_api_client";

/** An item the shop sells today: shopable, not disabled, and with a shop image to show it by. */
export function isShopableItem(item: Pick<Upgrade, "shopable" | "disabled" | "shop_image_webp">): boolean {
  return Boolean(item.shopable && !item.disabled && item.shop_image_webp);
}
