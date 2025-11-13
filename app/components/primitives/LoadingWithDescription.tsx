import { Item, ItemContent, ItemMedia, ItemTitle } from "~/components/ui/item";
import { Spinner } from "~/components/ui/spinner";

export function LoadingWithDescription({
	description,
}: {
	description: string;
}) {
	return (
		<div className="flex w-full max-w-xs flex-col gap-4 [--radius:1rem]">
			<Item variant="muted">
				<ItemMedia>
					<Spinner />
				</ItemMedia>
				<ItemContent>
					<ItemTitle className="line-clamp-1">{description}</ItemTitle>
				</ItemContent>
			</Item>
		</div>
	);
}
