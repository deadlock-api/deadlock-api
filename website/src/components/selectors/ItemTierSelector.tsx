import { Button } from "~/components/ui/button";

const TIERS = [1, 2, 3, 4];
const EMPTY_TIERS: number[] = [];

export function ItemTierSelector({
  onItemTiersSelected,
  selectedItemTiers = EMPTY_TIERS,
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
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="icon-[mdi--layers-triple] size-4 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Tiers</p>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {TIERS.map((tier) => (
          <Button
            key={tier}
            variant={selectedItemTiers?.includes(tier) ? "default" : "secondary"}
            size="icon-xs"
            onClick={() => handleToggle(tier)}
          >
            {tier}
          </Button>
        ))}
      </div>
    </div>
  );
}
