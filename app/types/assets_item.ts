export interface AssetsItem {
  id: number;
  item_tier: number;
  disabled?: boolean;
  name: string;
  shop_image_small: string;
  shop_image_small_webp: string;
  item_slot_type: "weapon" | "vitality" | "spirit";
}
