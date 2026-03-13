import { Filter } from "~/components/Filter";
import { STATS_TABS, type useHeroFilters } from "~/hooks/useHeroFilters";

type HeroFiltersProps = Pick<
	ReturnType<typeof useHeroFilters>,
	| "tab"
	| "minHeroMatches"
	| "setMinHeroMatches"
	| "minHeroMatchesTotal"
	| "setMinHeroMatchesTotal"
	| "minMatches"
	| "setMinMatches"
	| "gameMode"
	| "setGameMode"
	| "minRankId"
	| "maxRankId"
	| "setMinRankId"
	| "setMaxRankId"
	| "startDate"
	| "endDate"
	| "setDateRange"
	| "setPrevDates"
>;

export function HeroFiltersSection({
	tab,
	minHeroMatches,
	setMinHeroMatches,
	minHeroMatchesTotal,
	setMinHeroMatchesTotal,
	minMatches,
	setMinMatches,
	gameMode,
	setGameMode,
	minRankId,
	maxRankId,
	setMinRankId,
	setMaxRankId,
	startDate,
	endDate,
	setDateRange,
	setPrevDates,
}: HeroFiltersProps) {
	return (
		<Filter.Root>
			{STATS_TABS.includes(tab) ? (
				<>
					<Filter.MinMatches
						value={minHeroMatches}
						onChange={setMinHeroMatches}
						label="Min Hero Matches (Timerange)"
						step={10}
					/>
					<Filter.MinMatches
						value={minHeroMatchesTotal}
						onChange={setMinHeroMatchesTotal}
						label="Min Hero Matches (Total)"
						step={100}
					/>
				</>
			) : (
				<Filter.MinMatches
					value={minMatches}
					onChange={setMinMatches}
					label="Min Matches (Total)"
					step={10}
				/>
			)}
			{tab !== "stats-by-rank" && (
				<Filter.GameModeWithRank
					gameMode={gameMode}
					onGameModeChange={setGameMode}
					minRank={minRankId}
					maxRank={maxRankId}
					onRankChange={(min, max) => {
						setMinRankId(min);
						setMaxRankId(max);
					}}
				/>
			)}
			<Filter.PatchOrDate
				startDate={startDate}
				endDate={endDate}
				onDateChange={(s, e, ps, pe) => {
					setDateRange([s, e]);
					setPrevDates({ prevStartDate: ps, prevEndDate: pe });
				}}
			/>
		</Filter.Root>
	);
}
