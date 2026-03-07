import { Button } from "../ui/button";

const TIERS = [1, 2, 3, 4];

export type ItemCategory = "weapon" | "vitality" | "spirit";
const CATEGORIES: { value: ItemCategory; label: string; color: string }[] = [
  { value: "weapon", label: "Weapon", color: "rgb(229, 138, 0)" },
  { value: "vitality", label: "Vitality", color: "rgb(0, 255, 153)" },
  { value: "spirit", label: "Spirit", color: "rgb(0, 221, 255)" },
];

export default function ItemTierSelector({
  onItemTiersSelected,
  selectedItemTiers = [],
  onItemCategoriesSelected,
  selectedItemCategories = [],
}: {
  onItemTiersSelected: (selectedItemTier: number[]) => void;
  selectedItemTiers?: number[] | null;
  onItemCategoriesSelected?: (selectedCategories: ItemCategory[]) => void;
  selectedItemCategories?: ItemCategory[] | null;
}) {
  const handleTierToggle = (tier: number) => {
    const isSelected = selectedItemTiers?.includes(tier);
    const newSelection = isSelected
      ? selectedItemTiers?.filter((t) => t !== tier)
      : [...(selectedItemTiers || []), tier];
    onItemTiersSelected(newSelection || []);
  };

  const handleCategoryToggle = (category: ItemCategory) => {
    if (!onItemCategoriesSelected) return;
    const isSelected = selectedItemCategories?.includes(category);
    const newSelection = isSelected
      ? selectedItemCategories?.filter((c) => c !== category)
      : [...(selectedItemCategories || []), category];
    onItemCategoriesSelected(newSelection || []);
  };

  return (
    <div className="flex flex-wrap gap-4 items-center">
      <div className="flex flex-wrap gap-2 items-center">
        Categories:
        <div className="flex gap-2 items-center">
          {CATEGORIES.map((cat) => {
            const isSelected = selectedItemCategories?.includes(cat.value);
            return (
              <Button
                key={cat.value}
                type="button"
                className="px-4 py-2 rounded border"
                style={
                  isSelected
                    ? { backgroundColor: cat.color, color: "#000", borderColor: cat.color }
                    : { backgroundColor: "var(--muted)", color: "var(--muted-foreground)", borderColor: "transparent" }
                }
                onClick={() => handleCategoryToggle(cat.value)}
              >
                {cat.label}
              </Button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        Tiers:
        <div className="flex gap-2 items-center">
          {TIERS.map((tier) => (
            <Button
              key={tier}
              type="button"
              className={`px-4 py-2 rounded ${
                selectedItemTiers?.includes(tier)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
              onClick={() => handleTierToggle(tier)}
            >
              {tier}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
