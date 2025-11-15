import { useEffect, useState } from "react";
import { Item, ItemContent, ItemMedia, ItemTitle } from "~/components/ui/item";
import { Spinner } from "~/components/ui/spinner";

export interface LoadingWithDescriptionProps {
	description?: string;
	delay_ms?: number;
}

export function LoadingWithDescription({
	description = "Loading ...",
	delay_ms = 300,
}: LoadingWithDescriptionProps) {
	const [show, setShow] = useState(false);

	useEffect(() => {
		const timeout = setTimeout(() => setShow(true), delay_ms);
		return () => clearTimeout(timeout);
	}, []);

	if (!show) return null;
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
