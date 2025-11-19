import type { RankV2 } from "assets-deadlock-api-client";
import { useId, useMemo } from "react";
import BadgeImage from "~/components/assets/BadgeImage";
import BadgeName from "~/components/assets/BadgeName";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { extractBadgeMap, type SubtierInfo } from "~/lib/leaderboard";

interface RankSubtier {
	badge: number;
	info: SubtierInfo;
}

export function RankSelector({
	ranks,
	onSelect,
	selected,
	allowSelectNull = false,
	label = "Rank",
}: {
	ranks: RankV2[];
	onSelect: (selected: number | null) => void;
	selected?: number | null;
	allowSelectNull?: boolean;
	label?: string;
}) {
	const sortedRanks = useMemo(() => {
		const badgeMap = extractBadgeMap(ranks);
		const allRanks: RankSubtier[] = [];
		badgeMap.forEach((info, badge) => {
			allRanks.push({ badge, info });
		});
		// Sort by badge descending
		return allRanks.sort((a, b) => b.badge - a.badge);
	}, [ranks]);

	const handleValueChange = (value: string) => {
		if (value === "none" || value === "") {
			onSelect(null);
		} else {
			onSelect(Number(value));
		}
	};

	const selectValue =
		selected === null || selected === undefined ? "" : String(selected);

	const currentRank = selected
		? sortedRanks.find((opt: RankSubtier) => opt.badge === selected)
		: undefined;

	return (
		<div className="flex flex-col gap-1.5 w-full max-w-40">
			<div className="flex justify-center md:justify-start items-center h-8">
				<span className="text-sm font-semibold text-foreground">{label}</span>
			</div>
			<Select value={selectValue} onValueChange={handleValueChange}>
				<SelectTrigger className="w-full focus-visible:ring-0">
					<SelectValue placeholder={"Select Rank..."}>
						{currentRank ? (
							<div className="flex items-center gap-2">
								<BadgeImage
									ranks={ranks}
									badge={currentRank.badge}
									className="size-4 object-contain shrink-0"
								/>
								<BadgeName ranks={ranks} badge={currentRank.badge} />
							</div>
						) : null}
					</SelectValue>
				</SelectTrigger>
				<SelectContent className="max-h-[70vh]">
					{allowSelectNull && (
						<SelectItem value="none">
							<span className="truncate">None</span>
						</SelectItem>
					)}
					{sortedRanks.map((rank: RankSubtier) => (
						<SelectItem key={rank.badge} value={String(rank.badge)}>
							<div className="flex items-center gap-2 flex-nowrap">
								<BadgeImage
									ranks={ranks}
									badge={rank.badge}
									className="size-5 object-contain shrink-0"
								/>
								<BadgeName ranks={ranks} badge={rank.badge} />
							</div>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

export function RankSelectorMultiple({
	ranks,
	onSelect,
	selected,
	label = "Select Ranks...",
}: {
	ranks: RankV2[];
	onSelect: (selected: number[]) => void;
	selected: number[];
	label?: string;
}) {
	const sortedRanks = useMemo(() => {
		const badgeMap = extractBadgeMap(ranks);
		const allRanks: RankSubtier[] = [];
		badgeMap.forEach((info, badge) => {
			allRanks.push({ badge, info });
		});
		// Sort by badge descending
		return allRanks.sort((a, b) => b.badge - a.badge);
	}, [ranks]);

	const selectAllId = useId();

	const allSelected = selected.length === sortedRanks.length;
	const noneSelected = selected.length === 0;
	const indeterminate = !allSelected && !noneSelected;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					className="w-fit min-w-[150px] max-w-[250px] overflow-hidden max-h-20 min-h-9 h-min p-1 box-border"
				>
					<div className="flex flex-wrap gap-2 items-center justify-start">
						{selected.length === 0 ? (
							<span className="truncate text-muted-foreground">{label}</span>
						) : (
							selected
								.map((badge) => (
									<span
										key={badge}
										className="flex items-center justify-around gap-1 bg-muted rounded px-1 p-0.5"
									>
										<BadgeImage
											ranks={ranks}
											badge={badge}
											className="size-4 object-contain shrink-0"
										/>
										<BadgeName
											ranks={ranks}
											badge={badge}
											className="truncate text-xs"
										/>
									</span>
								))
								.slice(0, 5)
						)}
						{selected.length > 5 && (
							<span className="truncate text-muted-foreground">
								+{selected.length - 5}
							</span>
						)}
					</div>
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[220px] max-h-[400px] overflow-y-auto p-2">
				<div className="flex flex-col gap-1">
					<div className="flex items-center gap-2 px-2 py-1 border-b mb-1">
						<Checkbox
							checked={
								allSelected ? true : indeterminate ? "indeterminate" : false
							}
							onCheckedChange={(checked) => {
								if (checked) {
									onSelect(sortedRanks.map((rank: RankSubtier) => rank.badge));
								} else {
									onSelect([]);
								}
							}}
							id={selectAllId}
						/>
						<label
							htmlFor={selectAllId}
							className="text-sm cursor-pointer select-none"
						>
							Select all
						</label>
					</div>
					{sortedRanks.map((rank: RankSubtier) => (
						<div
							key={rank.badge}
							className="flex items-center gap-2 px-2 py-1 hover:bg-accent cursor-pointer"
						>
							<Checkbox
								checked={selected.includes(rank.badge)}
								tabIndex={-1}
								className="mr-2"
								onCheckedChange={() => {
									if (selected.includes(rank.badge)) {
										onSelect(
											selected.filter((id: number) => id !== rank.badge),
										);
									} else {
										onSelect([...selected, rank.badge]);
									}
								}}
								id={`rank-checkbox-${rank.badge}`}
							/>
							<label
								htmlFor={`rank-checkbox-${rank.badge}`}
								className="flex flex-nowrap items-center gap-2 w-full truncate text-sm cursor-pointer"
							>
								<BadgeImage
									ranks={ranks}
									badge={rank.badge}
									className="size-5 object-contain shrink-0"
								/>
								<BadgeName
									ranks={ranks}
									badge={rank.badge}
									className="truncate text-sm"
								/>
							</label>
						</div>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}
