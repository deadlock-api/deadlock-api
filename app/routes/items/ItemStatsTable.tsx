import type { HeroV2, UpgradeV2 } from "assets-deadlock-api-client";
import { ItemTierV2 } from "assets-deadlock-api-client/dist/api";
import type { ItemStats } from "deadlock-api-client";
import React, { useCallback, useMemo, useState } from "react";
import UpgradeImage from "~/components/assets/UpgradeImage";
import UpgradeName from "~/components/assets/UpgradeName";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";

export interface ItemStatsTableProps {
	heroes: HeroV2[];
	upgradeAssets: UpgradeV2[];
	itemStats: ItemStats[];
	tierIds?: number[];
}

type SortKey = string;
type SortDirection = "asc" | "desc";

const formatHeader = (header: string) => {
	if (header.endsWith("_per_match")) {
		const base = header.replace("_per_match", "");
		return `${base
			.replace(/_/g, " ")
			.replace(/\b\w/g, (l) => l.toUpperCase())} /m`;
	}
	if (header === "win_rate") return "Win Rate";
	if (header === "usage_rate") return "Usage Rate";

	return header.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
};

export function ItemStatsTable({
	itemStats,
	upgradeAssets,
	tierIds,
}: ItemStatsTableProps) {
	const [sortColumn, setSortColumn] = useState<SortKey>("win_rate");
	const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

	const augmentedItemStats = useMemo(() => {
		if (itemStats.length === 0) return [];
		const totalMatchesAllItems = itemStats.reduce(
			(sum, stat) => sum + stat.matches,
			0,
		);

		// Filter itemStats by tier if tierIds are provided
		const filteredItemStats =
			tierIds && tierIds.length > 0
				? itemStats.filter((stats) => {
						const upgradeAsset = upgradeAssets.find(
							(asset) => asset.id === stats.item_id,
						);
						return upgradeAsset && tierIds.includes(upgradeAsset.item_tier);
					})
				: itemStats;

		return filteredItemStats.map((s) => {
			const augmented = {
				...s,
				tier:
					upgradeAssets.find((asset) => asset.id === s.item_id)?.item_tier ??
					ItemTierV2.NUMBER_1,
				win_rate: s.matches > 0 ? s.wins / s.matches : 0,
				usage_rate:
					totalMatchesAllItems > 0 ? s.matches / totalMatchesAllItems : 0,
			};

			Object.keys(s)
				.filter((key) => key.startsWith("total_"))
				.forEach(
					(key) =>
						(augmented[`${key.replace("total_", "")}_per_match`] =
							s.matches > 0
								? (s[key as keyof typeof s] as number) / s.matches
								: 0),
				);
			return augmented;
		});
	}, [itemStats, upgradeAssets, tierIds]);

	const statColumns = useMemo(() => {
		if (augmentedItemStats.length === 0) return [];

		const keys = Object.keys(augmentedItemStats[0]);

		const filteredKeys = keys.filter(
			(key) =>
				key !== "item_id" &&
				!key.startsWith("total_") &&
				!key.includes("bucket") &&
				!key.includes("shots"),
		);

		const preferredOrder = [
			"tier",
			"matches",
			"players",
			"wins",
			"losses",
			"win_rate",
			"usage_rate",
		];

		return filteredKeys.sort((a, b) => {
			const indexA = preferredOrder.indexOf(a);
			const indexB = preferredOrder.indexOf(b);
			if (indexA !== -1 && indexB !== -1) return indexA - indexB;
			if (indexA !== -1) return -1;
			if (indexB !== -1) return 1;
			return a.localeCompare(b);
		});
	}, [augmentedItemStats]);

	const columnFormatting = useMemo(() => {
		const formatting = new Map<string, "fixed-0" | "fixed-2">();
		if (augmentedItemStats.length === 0) {
			return formatting;
		}

		for (const col of statColumns) {
			if (col === "win_rate" || col === "usage_rate" || col === "tier")
				continue;

			const isNumeric = augmentedItemStats.every(
				(stats) => typeof stats[col] === "number",
			);
			if (!isNumeric) continue;

			const allInRangeDecimal = augmentedItemStats.every((stats) => {
				const value = stats[col] as number;
				return value >= -20 && value <= 20;
			});

			if (allInRangeDecimal) {
				formatting.set(col, "fixed-2");
			} else {
				formatting.set(col, "fixed-0");
			}
		}
		return formatting;
	}, [augmentedItemStats, statColumns]);

	const sortedItemStats = useMemo(
		() =>
			[...augmentedItemStats].sort((a, b) => {
				const valA = a[sortColumn] as any;
				const valB = b[sortColumn] as any;

				if (typeof valA === "number" && typeof valB === "number") {
					return sortDirection === "asc" ? valA - valB : valB - valA;
				}

				const strA = String(valA ?? "");
				const strB = String(valB ?? "");

				return sortDirection === "asc"
					? strA.localeCompare(strB)
					: strB.localeCompare(strA);
			}),
		[augmentedItemStats, sortColumn, sortDirection],
	);

	if (itemStats.length === 0) {
		return <p>No item stats available for the selected filters.</p>;
	}

	const handleSort = useCallback(
		(column: SortKey) => {
			if (sortColumn === column) {
				setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
			} else {
				setSortColumn(column);
				setSortDirection("desc");
			}
		},
		[sortColumn],
	);

	const getSortIndicator = useCallback(
		(column: SortKey) =>
			sortColumn === column ? (sortDirection === "asc" ? " ▲" : " ▼") : "",
		[sortColumn, sortDirection],
	);

	return (
		<div className="rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="text-right w-[4ch]">#</TableHead>
						<TableHead>Item</TableHead>
						{statColumns.map((col, i) => (
							<TableHead
								key={col}
								className="cursor-pointer text-right"
								onClick={() => handleSort(col)}
							>
								{formatHeader(col)}
								{getSortIndicator(col)}
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{sortedItemStats.map((stats, index) => (
						<TableRow key={stats.item_id}>
							<TableCell className="text-right">{index + 1}</TableCell>
							<TableCell>
								<div className="flex items-center gap-2 min-w-34">
									<UpgradeImage
										upgradeAssets={upgradeAssets}
										upgradeId={stats.item_id}
										className="h-8 w-8 rounded-md"
									/>
									<UpgradeName
										upgradeAssets={upgradeAssets}
										upgradeId={stats.item_id}
									/>
								</div>
							</TableCell>
							{statColumns.map((col, i) => (
								<TableCell key={col} className="text-right">
									{(() => {
										const value = stats[col] as number | string;
										if (typeof value !== "number") {
											return value;
										}
										if (col === "win_rate" || col === "usage_rate") {
											return value.toLocaleString(undefined, {
												style: "percent",
												minimumFractionDigits: 2,
												maximumFractionDigits: 2,
											});
										}

										const formattingRule = columnFormatting.get(col);
										let options: Intl.NumberFormatOptions;
										if (formattingRule === "fixed-2") {
											options = {
												minimumFractionDigits: 2,
												maximumFractionDigits: 2,
											};
										} else if (formattingRule === "fixed-0") {
											options = { maximumFractionDigits: 0 };
										} else {
											options = { maximumFractionDigits: 2 };
										}

										return value.toLocaleString(undefined, options);
									})()}
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
