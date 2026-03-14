import { useQuery } from "@tanstack/react-query";
import type { AnalyticsHeroStats } from "deadlock_api_client";
import { useMemo } from "react";

import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { LoadingLogo } from "~/components/LoadingLogo";
import { ProgressBarWithLabel } from "~/components/primitives/ProgressBar";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { CACHE_DURATIONS } from "~/constants/cache";
import type { Dayjs } from "~/dayjs";
import { api } from "~/lib/api";
import { getPickrateMultiplier } from "~/lib/constants";
import { cn } from "~/lib/utils";
import { heroesQueryOptions } from "~/queries/asset-queries";
import { queryKeys } from "~/queries/query-keys";

const HERO_TYPE_CONFIG = {
	assassin: { label: "Assassin", color: "#a855f7" },
	brawler: { label: "Brawler", color: "#ef4444" },
	marksman: { label: "Marksman", color: "#22c55e" },
	mystic: { label: "Mystic", color: "#3b82f6" },
} as const;

type HeroType = keyof typeof HERO_TYPE_CONFIG;

const HERO_TYPE_ORDER: HeroType[] = ["assassin", "brawler", "marksman", "mystic"];

interface GroupStats {
	type: HeroType;
	winrate: number;
	pickrate: number;
	totalMatches: number;
	totalWins: number;
	prevWinrate?: number;
	prevPickrate?: number;
}

export function HeroStatsGroupedByType({
	columns,
	sortBy,
	minRankId,
	maxRankId,
	minHeroMatches,
	minHeroMatchesTotal,
	minDate,
	maxDate,
	prevMinDate,
	prevMaxDate,
	gameMode,
}: {
	columns: string[];
	sortBy?: keyof AnalyticsHeroStats | "winrate";
	minRankId?: number;
	maxRankId?: number;
	minHeroMatches?: number;
	minHeroMatchesTotal?: number;
	minDate?: Dayjs;
	maxDate?: Dayjs;
	prevMinDate?: Dayjs;
	prevMaxDate?: Dayjs;
	gameMode?: GameMode;
}) {
	const minDateTimestamp = useMemo(() => minDate?.unix() ?? 0, [minDate]);
	const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

	const heroStatsQuery = {
		minHeroMatches,
		minHeroMatchesTotal,
		minAverageBadge: minRankId,
		maxAverageBadge: maxRankId,
		minUnixTimestamp: minDateTimestamp,
		maxUnixTimestamp: maxDateTimestamp,
		gameMode,
	};
	const { data: heroData, isLoading: isLoadingStats } = useQuery({
		queryKey: queryKeys.analytics.heroStats(heroStatsQuery),
		queryFn: async () => {
			const response = await api.analytics_api.heroStats(heroStatsQuery);
			return response.data;
		},
		staleTime: CACHE_DURATIONS.ONE_DAY,
	});

	const prevMinTimestamp = useMemo(() => prevMinDate?.unix() ?? 0, [prevMinDate]);
	const prevMaxTimestamp = useMemo(() => prevMaxDate?.unix(), [prevMaxDate]);
	const hasPreviousInterval = prevMinDate != null && prevMaxDate != null;

	const prevHeroStatsQuery = {
		minHeroMatches,
		minHeroMatchesTotal,
		minAverageBadge: minRankId,
		maxAverageBadge: maxRankId,
		minUnixTimestamp: prevMinTimestamp,
		maxUnixTimestamp: prevMaxTimestamp,
		gameMode,
	};
	const { data: prevHeroData } = useQuery({
		queryKey: queryKeys.analytics.heroStats(prevHeroStatsQuery),
		queryFn: async () => {
			const response = await api.analytics_api.heroStats(prevHeroStatsQuery);
			return response.data;
		},
		staleTime: CACHE_DURATIONS.ONE_DAY,
		enabled: hasPreviousInterval,
	});

	const { data: heroes, isLoading: isLoadingHeroes } = useQuery(heroesQueryOptions);

	const pickrateMultiplier = getPickrateMultiplier(gameMode);

	const heroTypeMap = useMemo(() => {
		if (!heroes) return new Map<number, HeroType>();
		const map = new Map<number, HeroType>();
		for (const hero of heroes) {
			if (hero.hero_type) {
				map.set(hero.id, hero.hero_type as HeroType);
			}
		}
		return map;
	}, [heroes]);

	const prevStatsMap = useMemo(() => {
		if (!prevHeroData) return undefined;
		const prevSumMatches = prevHeroData.reduce((acc, row) => acc + row.matches, 0);
		const prevMaxMatches = Math.max(...prevHeroData.map((item) => item.matches));
		const map = new Map<number, { winrate: number; pickrate: number; normalizedPickrate: number }>();
		for (const row of prevHeroData) {
			map.set(row.hero_id, {
				winrate: row.wins / row.matches,
				pickrate: pickrateMultiplier * (row.matches / prevSumMatches),
				normalizedPickrate: row.matches / prevMaxMatches,
			});
		}
		return map;
	}, [prevHeroData, pickrateMultiplier]);

	const { groupedData, groupStats, minWinrate, maxWinrate, minMatches, maxMatches, sumMatches } = useMemo(() => {
		if (!heroData || !heroes) {
			return { groupedData: new Map<HeroType, AnalyticsHeroStats[]>(), groupStats: [] as GroupStats[], minWinrate: 0, maxWinrate: 1, minMatches: 0, maxMatches: 1, sumMatches: 1 };
		}

		const sumMatches = heroData.reduce((acc, row) => acc + row.matches, 0);
		const maxMatchesVal = Math.max(...heroData.map((item) => item.matches));
		const minMatchesVal = Math.min(...heroData.map((item) => item.matches));
		const minWinrateVal = Math.min(...heroData.map((item) => item.wins / item.matches));
		const maxWinrateVal = Math.max(...heroData.map((item) => item.wins / item.matches));

		// Group heroes by type
		const grouped = new Map<HeroType, AnalyticsHeroStats[]>();
		for (const type of HERO_TYPE_ORDER) {
			grouped.set(type, []);
		}

		for (const row of heroData) {
			const type = heroTypeMap.get(row.hero_id);
			if (type && grouped.has(type)) {
				grouped.get(type)!.push(row);
			}
		}

		// Sort heroes within each group
		for (const [, heroes] of grouped) {
			heroes.sort((a, b) => {
				if (sortBy && sortBy !== "winrate") return b[sortBy] - a[sortBy];
				return b.wins / b.matches - (a.wins / a.matches);
			});
		}

		// Compute group-level stats
		const prevSumMatches = prevHeroData?.reduce((acc, row) => acc + row.matches, 0) ?? 0;
		const stats: GroupStats[] = HERO_TYPE_ORDER.map((type) => {
			const heroesInGroup = grouped.get(type) ?? [];
			const totalMatches = heroesInGroup.reduce((acc, row) => acc + row.matches, 0);
			const totalWins = heroesInGroup.reduce((acc, row) => acc + row.wins, 0);

			let prevWinrate: number | undefined;
			let prevPickrate: number | undefined;
			if (prevHeroData && prevSumMatches > 0) {
				const prevHeroesInGroup = prevHeroData.filter((row) => heroTypeMap.get(row.hero_id) === type);
				const prevTotalMatches = prevHeroesInGroup.reduce((acc, row) => acc + row.matches, 0);
				const prevTotalWins = prevHeroesInGroup.reduce((acc, row) => acc + row.wins, 0);
				if (prevTotalMatches > 0) {
					prevWinrate = prevTotalWins / prevTotalMatches;
					prevPickrate = pickrateMultiplier * (prevTotalMatches / prevSumMatches);
				}
			}

			return {
				type,
				winrate: totalMatches > 0 ? totalWins / totalMatches : 0,
				pickrate: sumMatches > 0 ? pickrateMultiplier * (totalMatches / sumMatches) : 0,
				totalMatches,
				totalWins,
				prevWinrate,
				prevPickrate,
			};
		}).filter((g) => g.totalMatches > 0);

		return {
			groupedData: grouped,
			groupStats: stats,
			minWinrate: minWinrateVal,
			maxWinrate: maxWinrateVal,
			minMatches: minMatchesVal,
			maxMatches: maxMatchesVal,
			sumMatches,
		};
	}, [heroData, heroes, heroTypeMap, sortBy, prevHeroData, pickrateMultiplier]);

	if (isLoadingStats || isLoadingHeroes) {
		return (
			<div className="flex h-full w-full items-center justify-center py-16">
				<LoadingLogo />
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			{groupStats.map((group) => {
				const heroesInGroup = groupedData.get(group.type) ?? [];
				const config = HERO_TYPE_CONFIG[group.type];
				const winrateDelta = group.prevWinrate !== undefined ? group.winrate - group.prevWinrate : undefined;
				const pickrateDelta = group.prevPickrate !== undefined ? group.pickrate - group.prevPickrate : undefined;

				return (
					<div key={group.type} className="overflow-hidden rounded-lg border border-border">
						<div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border bg-muted/50 px-4 py-3">
							<div className="flex items-center gap-2">
								<div className="size-3 rounded-full" style={{ backgroundColor: config.color }} />
								<h3 className="text-lg font-semibold">{config.label}</h3>
								<span className="text-sm text-muted-foreground">({heroesInGroup.length} heroes)</span>
							</div>
							<div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
								{columns.includes("winRate") && (
									<div className="flex items-center gap-1.5">
										<span className="text-muted-foreground">Win Rate:</span>
										<span className="font-semibold">{(group.winrate * 100).toFixed(1)}%</span>
										{winrateDelta !== undefined && winrateDelta !== 0 && (
											<span className={cn("text-xs font-medium", winrateDelta > 0 ? "text-green-500" : "text-red-500")}>
												{winrateDelta > 0 ? "+" : ""}
												{(winrateDelta * 100).toFixed(1)}%
											</span>
										)}
									</div>
								)}
								{columns.includes("pickRate") && (
									<div className="flex items-center gap-1.5">
										<span className="text-muted-foreground">Pick Rate:</span>
										<span className="font-semibold">{(group.pickrate * 100).toFixed(1)}%</span>
										{pickrateDelta !== undefined && pickrateDelta !== 0 && (
											<span className={cn("text-xs font-medium", pickrateDelta > 0 ? "text-green-500" : "text-red-500")}>
												{pickrateDelta > 0 ? "+" : ""}
												{(pickrateDelta * 100).toFixed(1)}%
											</span>
										)}
									</div>
								)}
								{columns.includes("totalMatches") && (
									<div className="flex items-center gap-1.5">
										<span className="text-muted-foreground">Matches:</span>
										<span className="font-semibold">{group.totalMatches.toLocaleString()}</span>
									</div>
								)}
							</div>
						</div>
						<Table>
							<TableHeader className="bg-muted">
								<TableRow>
									<TableHead className="text-center">#</TableHead>
									<TableHead>Hero</TableHead>
									{columns.includes("winRate") && <TableHead className="text-center">Win Rate</TableHead>}
									{columns.includes("pickRate") && (
										<TableHead className="text-center">
											{minHeroMatchesTotal || minHeroMatches ? (
												<>
													Pick Rate
													<br />
													(Normalized)
												</>
											) : (
												"Pick Rate"
											)}
										</TableHead>
									)}
									{columns.includes("KDA") && <TableHead className="text-center">Kills/Deaths/Assists</TableHead>}
									{columns.includes("totalMatches") && <TableHead className="text-center">Total Matches</TableHead>}
								</TableRow>
							</TableHeader>
							<TableBody>
								{heroesInGroup.map((row, index) => (
									<TableRow key={row.hero_id}>
										<TableCell className="text-center font-semibold">{index + 1}</TableCell>
										<TableCell>
											<div className="flex items-center gap-2">
												<HeroImage heroId={row.hero_id} />
												<HeroName heroId={row.hero_id} />
											</div>
										</TableCell>
										{columns.includes("winRate") && (
											<TableCell>
												<ProgressBarWithLabel
													min={minWinrate}
													max={maxWinrate}
													value={row.wins / row.matches}
													color={"#fa4454"}
													label={`${Math.round((row.wins / row.matches) * 100).toFixed(0)}% `}
													delta={
														prevStatsMap?.get(row.hero_id) !== undefined
															? row.wins / row.matches - prevStatsMap.get(row.hero_id)!.winrate
															: undefined
													}
													tooltip={
														<div className="flex flex-col gap-1 text-xs">
															<div className="flex justify-between gap-4">
																<span className="text-muted-foreground">Matches</span>
																<span className="font-medium">{row.matches.toLocaleString()}</span>
															</div>
															<div className="flex justify-between gap-4">
																<span className="text-muted-foreground">Wins</span>
																<span className="font-medium">{row.wins.toLocaleString()}</span>
															</div>
															<div className="flex justify-between gap-4">
																<span className="text-muted-foreground">Win rate</span>
																<span className="font-medium">{((row.wins / row.matches) * 100).toFixed(2)}%</span>
															</div>
															{prevStatsMap?.get(row.hero_id) !== undefined && (
																<div className="mt-0.5 flex justify-between gap-4 border-t border-border pt-1">
																	<span className="text-muted-foreground">Previous</span>
																	<span className="font-medium">
																		{(prevStatsMap.get(row.hero_id)!.winrate * 100).toFixed(2)}%
																	</span>
																</div>
															)}
														</div>
													}
												/>
											</TableCell>
										)}
										{columns.includes("pickRate") && (
											<TableCell>
												<ProgressBarWithLabel
													min={minMatches}
													max={maxMatches}
													value={row.matches}
													color={"#22d3ee"}
													label={
														minHeroMatchesTotal || minHeroMatches
															? `${Math.round((row.matches / maxMatches) * 100).toFixed(0)}% `
															: `${Math.round(pickrateMultiplier * (row.matches / sumMatches) * 100).toFixed(0)}% `
													}
													delta={
														prevStatsMap?.get(row.hero_id) !== undefined
															? minHeroMatchesTotal || minHeroMatches
																? row.matches / maxMatches - prevStatsMap.get(row.hero_id)!.normalizedPickrate
																: pickrateMultiplier * (row.matches / sumMatches) - prevStatsMap.get(row.hero_id)!.pickrate
															: undefined
													}
													tooltip={
														<div className="flex flex-col gap-1 text-xs">
															<div className="flex justify-between gap-4">
																<span className="text-muted-foreground">Matches</span>
																<span className="font-medium">{row.matches.toLocaleString()}</span>
															</div>
															<div className="flex justify-between gap-4">
																<span className="text-muted-foreground">Pick rate</span>
																<span className="font-medium">
																	{(minHeroMatchesTotal || minHeroMatches
																		? (row.matches / maxMatches) * 100
																		: pickrateMultiplier * (row.matches / sumMatches) * 100
																	).toFixed(2)}
																	%
																</span>
															</div>
															{prevStatsMap?.get(row.hero_id) !== undefined && (
																<div className="mt-0.5 flex justify-between gap-4 border-t border-border pt-1">
																	<span className="text-muted-foreground">Previous</span>
																	<span className="font-medium">
																		{(
																			(minHeroMatchesTotal || minHeroMatches
																				? prevStatsMap.get(row.hero_id)!.normalizedPickrate
																				: prevStatsMap.get(row.hero_id)!.pickrate) * 100
																		).toFixed(2)}
																		%
																	</span>
																</div>
															)}
														</div>
													}
												/>
											</TableCell>
										)}
										{columns.includes("KDA") && (
											<TableCell className="text-center">
												<span className="px-2 font-semibold text-green-500">
													{(Math.round((row.total_kills / row.matches) * 10) / 10).toFixed(1)}
												</span>
												/
												<span className="px-2 font-semibold text-red-500">
													{(Math.round((row.total_deaths / row.matches) * 10) / 10).toFixed(1)}
												</span>
												/
												<span className="px-2 font-semibold text-orange-500">
													{(Math.round((row.total_assists / row.matches) * 10) / 10).toFixed(1)}
												</span>
											</TableCell>
										)}
										{columns.includes("totalMatches") && (
											<TableCell className="text-center">{row.matches.toLocaleString()}</TableCell>
										)}
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				);
			})}
		</div>
	);
}
