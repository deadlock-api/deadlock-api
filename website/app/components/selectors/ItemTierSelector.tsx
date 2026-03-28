import { Button } from "../ui/button";

const TIERS = [1, 2, 3, 4];

export function ItemTierSelector({
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
    <div className="flex flex-wrap items-center gap-2">
      Tiers:
      <div className="item-center flex gap-2">
        {TIERS.map((tier) => (
          <Button
            key={tier}
            type="button"
            className={`rounded px-4 py-2 ${
              selectedItemTiers?.includes(tier)
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
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
