import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";

export interface StringSelectorProps {
	values: string[];
	onSelect: (selected: string | null) => void;
	selected?: string | null;
	allowSelectNull?: boolean;
	placeholder?: string;
	label?: string;
}

export function StringSelector({
	values,
	onSelect,
	selected,
	allowSelectNull = false,
	placeholder,
	label,
}: StringSelectorProps) {
	return (
		<div className="flex flex-col gap-1.5 w-full max-w-[200px]">
			<div className="flex justify-center md:justify-start items-center h-8">
				<span className="text-sm font-semibold text-foreground">{label}</span>
			</div>
			<Select value={selected ?? undefined} onValueChange={onSelect}>
				<SelectTrigger className="w-full focus-visible:ring-0">
					<SelectValue placeholder={placeholder}>{selected}</SelectValue>
				</SelectTrigger>
				<SelectContent className="flex items-center gap-2 w-fit max-h-[70vh] overflow-y-scroll flex-nowrap flex-row">
					{allowSelectNull && (
						<SelectItem value="none">
							<span className="truncate">None</span>
						</SelectItem>
					)}
					{values.map((item) => (
						<SelectItem key={item} value={item}>
							{item}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
