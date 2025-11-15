import type { HeroV2, RankV2 } from "assets-deadlock-api-client";
import type { Leaderboard } from "deadlock-api-client";
import Fuse from "fuse.js";
import { useMemo, useState } from "react";
import BadgeImage from "~/components/assets/BadgeImage";
import HeroImage from "~/components/assets/HeroImage";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { extractBadgeMap, type SubtierInfo } from "~/lib/leaderboard";
import { hexToRgba } from "~/lib/utils";
import { LeaderboardControls } from "./LeaderboardControls";

export interface LeaderboardTableProps {
	ranks: RankV2[];
	heroes: HeroV2[];
	leaderboard: Leaderboard;
	onHeroClick: (heroId: number) => void;
}

interface LeaderboardTableRowProps {
	entry: Leaderboard["entries"][number];
	ranks: RankV2[];
	heroes: HeroV2[];
	heroesMap: Map<number, HeroV2>;
	badgeMap: Map<number, SubtierInfo>;
	shouldShowBadgeColumn: boolean;
	shouldShowTopHeroesColumn: boolean;
	onHeroClick: (heroId: number) => void;
}

export function LeaderboardTable({
	ranks,
	heroes,
	leaderboard,
	onHeroClick,
}: LeaderboardTableProps) {
	const badgeMap = extractBadgeMap(ranks);
	const heroesMap = new Map<number, HeroV2>();
	heroes.forEach((hero) => {
		heroesMap.set(hero.id, hero);
	});

	const [currentPage, setCurrentPage] = useState(0);
	const [itemsPerPage, setItemsPerPage] = useState(25);
	const [searchQuery, setSearchQuery] = useState("");

	const sortedEntries = useMemo(
		() => leaderboard.entries.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)),
		[leaderboard.entries],
	);

	const fuse = useMemo(
		() =>
			new Fuse(sortedEntries, {
				keys: ["account_name"],
				threshold: 0.4,
			}),
		[sortedEntries],
	);

	const filteredEntries = useMemo(
		() =>
			searchQuery ? fuse.search(searchQuery).map((r) => r.item) : sortedEntries,
		[searchQuery, sortedEntries, fuse],
	);

	const shouldShowBadgeColumn = useMemo(
		() => filteredEntries.some((e) => e.badge_level),
		[filteredEntries],
	);

	const shouldShowTopHeroesColumn = useMemo(
		() =>
			filteredEntries.some((e) => e.top_hero_ids && e.top_hero_ids.length > 0),
		[filteredEntries],
	);

	const totalPages = Math.ceil(filteredEntries.length / itemsPerPage);

	const paginatedEntries = useMemo(() => {
		const startIndex = currentPage * itemsPerPage;
		return filteredEntries.slice(startIndex, startIndex + itemsPerPage);
	}, [filteredEntries, currentPage, itemsPerPage]);

	let rankWidth = 10;
	let accountNameWidth = 90;
	if (shouldShowBadgeColumn && shouldShowTopHeroesColumn) {
		rankWidth = 10;
		accountNameWidth = 50;
	} else if (shouldShowBadgeColumn) {
		rankWidth = 10;
		accountNameWidth = 70;
	} else if (shouldShowTopHeroesColumn) {
		rankWidth = 10;
		accountNameWidth = 65;
	}

	const controls = (
		<LeaderboardControls
			searchQuery={searchQuery}
			setSearchQuery={setSearchQuery}
			itemsPerPage={itemsPerPage}
			setItemsPerPage={setItemsPerPage}
			currentPage={currentPage}
			setCurrentPage={setCurrentPage}
			totalPages={totalPages}
		/>
	);

	return (
		<div>
			{controls}
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead style={{ width: `${rankWidth}%` }}>Rank</TableHead>
						<TableHead style={{ width: `${accountNameWidth}%` }}>
							Account Name
						</TableHead>
						{shouldShowBadgeColumn && (
							<TableHead style={{ width: "20%" }}>Badge</TableHead>
						)}
						{shouldShowTopHeroesColumn && (
							<TableHead style={{ width: "20%" }}>Top Heroes</TableHead>
						)}
					</TableRow>
				</TableHeader>
				<TableBody>
					{paginatedEntries.map((entry) => (
						<LeaderboardTableRow
							key={`${entry.account_name}-${entry.rank}`}
							entry={entry}
							ranks={ranks}
							heroes={heroes}
							heroesMap={heroesMap}
							badgeMap={badgeMap}
							shouldShowBadgeColumn={shouldShowBadgeColumn}
							shouldShowTopHeroesColumn={shouldShowTopHeroesColumn}
							onHeroClick={onHeroClick}
						/>
					))}
				</TableBody>
			</Table>
			{controls}
		</div>
	);
}

function LeaderboardTableRow({
	entry,
	ranks,
	heroes,
	heroesMap,
	badgeMap,
	shouldShowBadgeColumn,
	shouldShowTopHeroesColumn,
	onHeroClick,
}: LeaderboardTableRowProps) {
	const rowColor = entry.badge_level
		? badgeMap.get(entry.badge_level)?.color
		: undefined;
	const backgroundColor = rowColor ? hexToRgba(rowColor, 0.1) : undefined;

	return (
		<TableRow
			key={`${entry.account_name}-${entry.rank}`}
			style={backgroundColor ? { backgroundColor } : undefined}
		>
			<TableCell>{entry.rank}</TableCell>
			<TableCell className="max-w-[150px] truncate">
				{entry.account_name}
			</TableCell>
			{shouldShowBadgeColumn && (
				<TableCell>
					{entry.badge_level && (
						<BadgeImage
							badge={entry.badge_level}
							ranks={ranks}
							imageType="small"
							className="h-8 w-8"
						/>
					)}
				</TableCell>
			)}
			{shouldShowTopHeroesColumn && (
				<TableCell>
					<div className="flex space-x-3">
						{entry.top_hero_ids &&
							entry.top_hero_ids.map((heroId) => {
								const hero = heroesMap.get(heroId);
								return hero ? (
									<HeroImage
										key={heroId}
										heroId={heroId}
										heroes={heroes}
										className="h-8 w-8 rounded-full object-cover border border-gray-700 cursor-pointer"
										onClick={() => onHeroClick(heroId)}
									/>
								) : null;
							})}
					</div>
				</TableCell>
			)}
		</TableRow>
	);
}
