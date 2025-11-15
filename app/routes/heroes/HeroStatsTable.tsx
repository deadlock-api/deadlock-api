import type { HeroV2 } from "assets-deadlock-api-client";
import type { AnalyticsHeroStats } from "deadlock-api-client";
import { useMemo, useState } from "react";
import HeroImage from "~/components/assets/HeroImage";
import HeroName from "~/components/assets/HeroName";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";

export interface HeroStatsTableProps {
	heroes: HeroV2[];
	heroStats: AnalyticsHeroStats[];
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
	if (header === "pick_rate") return "Pick Rate";

	return header.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
};

export function HeroStatsTable({ heroes, heroStats }: HeroStatsTableProps) {
	const [sortColumn, setSortColumn] = useState<SortKey>("win_rate");
	const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

	const heroesMap = useMemo(() => {
		const map = new Map<number, HeroV2>();
		heroes.forEach((hero) => {
			map.set(hero.id, hero);
		});
		return map;
	}, [heroes]);

	const augmentedHeroStats = useMemo(() => {
		if (heroStats.length === 0) return [];
		const totalMatchesAllHeroes = heroStats.reduce(
			(sum, stat) => sum + stat.matches,
			0,
		);

		return heroStats.map((s) => {
			const augmented = { ...s } as Record<string, any>;
			augmented.accuracy =
				s.total_shots_hit + s.total_shots_missed > 0
					? s.total_shots_hit / (s.total_shots_hit + s.total_shots_missed)
					: 0;
			augmented.win_rate = s.matches > 0 ? s.wins / s.matches : 0;
			augmented.pick_rate =
				totalMatchesAllHeroes > 0
					? (12 * s.matches) / totalMatchesAllHeroes
					: 0;

			Object.keys(s).forEach((key) => {
				if (key.startsWith("total_")) {
					const newKey = key.replace("total_", "") + "_per_match";
					augmented[newKey] =
						s.matches > 0
							? (s[key as keyof typeof s] as number) / s.matches
							: 0;
				}
			});
			return augmented;
		});
	}, [heroStats]);

	const statColumns = useMemo(() => {
		if (augmentedHeroStats.length === 0) return [];

		const keys = Object.keys(augmentedHeroStats[0]);

		const filteredKeys = keys.filter(
			(key) =>
				key !== "hero_id" &&
				!key.startsWith("total_") &&
				!key.includes("bucket") &&
				!key.includes("shots"),
		);

		const preferredOrder = [
			"matches",
			"players",
			"wins",
			"losses",
			"win_rate",
			"pick_rate",
			"accuracy",
			"kills_per_match",
			"deaths_per_match",
			"assists_per_match",
		];

		return filteredKeys.sort((a, b) => {
			const indexA = preferredOrder.indexOf(a);
			const indexB = preferredOrder.indexOf(b);
			if (indexA !== -1 && indexB !== -1) return indexA - indexB;
			if (indexA !== -1) return -1;
			if (indexB !== -1) return 1;
			return a.localeCompare(b);
		});
	}, [augmentedHeroStats]);

	const columnFormatting = useMemo(() => {
		const formatting = new Map<string, "fixed-0" | "fixed-2">();
		if (augmentedHeroStats.length === 0) {
			return formatting;
		}

		for (const col of statColumns) {
			if (col === "win_rate" || col === "pick_rate" || col === "accuracy")
				continue;

			const isNumeric = augmentedHeroStats.every(
				(stats) => typeof stats[col] === "number",
			);
			if (!isNumeric) continue;

			const allInRangeDecimal = augmentedHeroStats.every((stats) => {
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
	}, [augmentedHeroStats, statColumns]);

	const sortedHeroStats = useMemo(() => {
		return [...augmentedHeroStats].sort((a, b) => {
			if (sortColumn === "hero_name") {
				const heroA = heroesMap.get(a.hero_id)?.name ?? "";
				const heroB = heroesMap.get(b.hero_id)?.name ?? "";
				return sortDirection === "asc"
					? heroA.localeCompare(heroB)
					: heroB.localeCompare(heroA);
			}

			const valA = a[sortColumn];
			const valB = b[sortColumn];

			if (typeof valA === "number" && typeof valB === "number") {
				return sortDirection === "asc" ? valA - valB : valB - valA;
			}

			const strA = String(valA ?? "");
			const strB = String(valB ?? "");

			return sortDirection === "asc"
				? strA.localeCompare(strB)
				: strB.localeCompare(strA);
		});
	}, [augmentedHeroStats, sortColumn, sortDirection, heroesMap]);

	if (heroStats.length === 0) {
		return <p>No hero stats available for the selected filters.</p>;
	}

	const handleSort = (column: SortKey) => {
		if (sortColumn === column) {
			setSortDirection(sortDirection === "asc" ? "desc" : "asc");
		} else {
			setSortColumn(column);
			setSortDirection("desc");
		}
	};

	const getSortIndicator = (column: SortKey) => {
		if (sortColumn === column) {
			return sortDirection === "asc" ? " ▲" : " ▼";
		}
		return "";
	};

	return (
		<div className="rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="text-right">#</TableHead>
						<TableHead
							className="cursor-pointer"
							onClick={() => handleSort("hero_name")}
						>
							Hero
							{getSortIndicator("hero_name")}
						</TableHead>
						{statColumns.map((col) => (
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
					{sortedHeroStats.map((stats, index) => {
						const hero = heroesMap.get(stats.hero_id);
						return (
							<TableRow key={stats.hero_id}>
								<TableCell className="text-right">{index + 1}</TableCell>
								<TableCell>
									{hero ? (
										<div className="flex items-center gap-2 min-w-34">
											<HeroImage
												heroId={hero.id}
												heroes={heroes}
												className="h-8 w-8 rounded-md"
											/>
											<HeroName heroId={hero.id} heroes={heroes} />
										</div>
									) : (
										"Unknown Hero"
									)}
								</TableCell>
								{statColumns.map((col) => (
									<TableCell key={col} className="text-right">
										{(() => {
											const value = stats[col];
											if (typeof value !== "number") {
												return value;
											}
											if (
												col === "win_rate" ||
												col === "pick_rate" ||
												col === "accuracy"
											) {
												return value.toLocaleString(undefined, {
													style: "percent",
													minimumFractionDigits: 2,
													maximumFractionDigits: 2,
												});
											}

											const formattingRule = columnFormatting.get(col);
											let options: Intl.NumberFormatOptions = {};
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
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}
