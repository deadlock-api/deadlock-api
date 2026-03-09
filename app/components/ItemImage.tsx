import { Skeleton } from "~/components/ui/skeleton";
import { useItemById } from "~/hooks/useAssetById";
import { cn } from "~/lib/utils";

export function ItemImage({ itemId, className }: { itemId: number; className?: string }) {
	const { item, isLoading } = useItemById(itemId);

	if (isLoading) {
		return <Skeleton className={cn("size-8", className)} />;
	}

	if (!item || !item.shop_image_webp) {
		return <div className={cn("size-8 aspect-square bg-muted rounded", className)} />;
	}

	return (
		<picture>
			{item?.shop_image_webp && <source srcSet={item?.shop_image_webp} type="image/webp" />}
			{item?.shop_image && <source srcSet={item?.shop_image} type="image/png" />}
			<img
				loading="lazy"
				src={item?.shop_image_small ?? ""}
				alt={item?.name ?? "Unknown Item"}
				title={item?.name ?? "Unknown Item"}
				className={cn("size-8 aspect-square", className)}
			/>
		</picture>
	);
}
