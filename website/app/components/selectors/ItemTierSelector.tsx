import { Button } from "../ui/button";

const TIERS = [1, 2, 3, 4];

export default function ItemTierSelector({
  onItemTiersSelected,
  selectedItemTiers = [],
}: {
  onItemTiersSelected: (selectedItemTier: number[]) => void;
  selectedItemTiers?: number[] | null;
}) {
  const handleToggle = (tier: number) => {
    const isSelected = selectedItemTiers?.includes(tier);
    const newSelection = isSelected
      ? selectedItemTiers?.filter((t) => t !== tier)
      : [...(selectedItemTiers || []), tier];
    onItemTiersSelected(newSelection || []);
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
      Tiers:
      <div className="flex gap-2 item-center">
        {TIERS.map((tier) => (
          <Button
            key={tier}
            type="button"
            className={`px-4 py-2 rounded ${
              selectedItemTiers?.includes(tier) ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"
            }`}
            onClick={() => handleToggle(tier)}
          >
            {tier}
          </Button>
        ))}
      </div>
    </div>
  );
}
