import { ItemTierV2 } from "assets-deadlock-api-client/dist/api";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export interface TierSelectorProps {
	/**
	 * Currently selected tiers (1-4)
	 */
	selected: ItemTierV2[];
	/**
	 * Callback when selection changes
	 */
	onSelectionChange: (selected: ItemTierV2[]) => void;
	/**
	 * Optional label for the selector
	 */
	label?: string;
	/**
	 * Optional class name for styling
	 */
	className?: string;
}

export function TierSelector({
	selected,
	onSelectionChange,
	label = "Tiers",
	className,
}: TierSelectorProps) {
	const toggleTier = (tier: ItemTierV2) => {
		if (selected.includes(tier)) {
			onSelectionChange(selected.filter((t) => t !== tier));
		} else {
			onSelectionChange([...selected, tier].sort((a, b) => a - b));
		}
	};

	const isTierSelected = (tier: ItemTierV2) => selected.includes(tier);

	return (
		<div className={cn("flex flex-col gap-1.5", className)}>
			<div className="flex justify-center md:justify-start items-center h-8">
				<span className="text-sm font-semibold text-foreground">{label}</span>
			</div>
			<div className="flex gap-2 w-fit">
				{Object.values(ItemTierV2).map((tier) => (
					<Button
						key={tier}
						variant={isTierSelected(tier) ? "default" : "outline"}
						size="sm"
						className={cn("rounded-lg size-9 flex items-center justify-center")}
						onClick={() => toggleTier(tier)}
						aria-pressed={isTierSelected(tier)}
					>
						<span className="font-medium">{tier}</span>
					</Button>
				))}
			</div>
		</div>
	);
}
