import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";

export interface StringSelectorProps {
	options: { value: string; label: string }[];
	onSelect: (selected: string) => void;
	selected?: string | null;
	allowSelectNull?: boolean;
	placeholder?: string;
	label?: string;
}

export function StringSelector({
	options,
	onSelect,
	selected,
	allowSelectNull = false,
	placeholder,
	label,
}: StringSelectorProps) {
	const valueLabelMap = new Map<string, string>(
		options.map((o) => [o.value, o.label]),
	);
	return (
		<div className="flex flex-col gap-1.5 w-full max-w-40">
			<div className="flex justify-center md:justify-start items-center h-8">
				<span className="text-sm font-semibold text-foreground">{label}</span>
			</div>
			<Select value={selected ?? undefined} onValueChange={onSelect}>
				<SelectTrigger className="w-full focus-visible:ring-0">
					<SelectValue placeholder={placeholder}>
						{selected ? valueLabelMap.get(selected) : ""}
					</SelectValue>
				</SelectTrigger>
				<SelectContent className="flex items-center gap-2 w-fit max-h-[70vh] overflow-y-scroll flex-nowrap flex-row">
					{allowSelectNull && (
						<SelectItem value="none">
							<span className="truncate">None</span>
						</SelectItem>
					)}
					{options.map((item) => (
						<SelectItem key={item.value} value={item.value}>
							{item.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
