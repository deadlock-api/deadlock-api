import type { HeroV2 } from "assets-deadlock-api-client";
import { fromUnixTime, getUnixTime } from "date-fns";
import type { AnalyticsApiKillDeathStatsRequest } from "deadlock-api-client/api";
import { useCallback } from "react";
import { PatchOrDatePicker } from "~/components/primitives/PatchOrDatePicker";
import { HeroSelectorMultiple } from "~/components/primitives/selectors/HeroSelector";
import { TimeRangeFilter } from "~/components/primitives/TimeRangeFilter";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import {
	MAX_GAME_DURATION_S,
	MIN_GAME_DURATION_S,
	PATCHES,
} from "~/lib/consts";

export interface HeatmapFilterProps {
	heroes: HeroV2[];
	value: AnalyticsApiKillDeathStatsRequest;
	onChange: (filter: AnalyticsApiKillDeathStatsRequest) => void;
}

export default function HeatmapFilter({
	heroes,
	value,
	onChange,
}: HeatmapFilterProps) {
	const handleDurationRangeChange = useCallback(
		(range: [number, number]) =>
			onChange({
				...value,
				minDurationS: range[0],
				maxDurationS: range[1],
			}),
		[onChange, value],
	);

	const handleGameTimeRangeChange = useCallback(
		(range: [number, number]) =>
			onChange({
				...value,
				minGameTimeS: range[0],
				maxGameTimeS: range[1],
			}),
		[onChange, value],
	);

	const handleDateChange = useCallback(
		({ startDate, endDate }: { startDate?: Date; endDate?: Date }) =>
			onChange({
				...value,
				minUnixTimestamp: startDate ? getUnixTime(startDate) : undefined,
				maxUnixTimestamp: endDate ? getUnixTime(endDate) : undefined,
			}),
		[onChange, value],
	);

	const handleTeamChange = useCallback(
		(team: boolean) =>
			onChange({
				...value,
				team: team ? 1 : 0,
			}),
		[onChange, value],
	);

	const handleHeroesChange = useCallback(
		(heroIds: number[] | null) => {
			heroIds = (heroIds?.length ?? 0 > 0) ? heroIds : null;
			onChange({
				...value,
				heroIds: heroIds?.join(",") ?? undefined,
			});
		},
		[onChange, value],
	);

	return (
		<div className="flex flex-wrap justify-center items-center w-full gap-8">
			<TimeRangeFilter
				value={[
					value.minGameTimeS ?? MIN_GAME_DURATION_S,
					value.maxGameTimeS ?? MAX_GAME_DURATION_S,
				]}
				min={MIN_GAME_DURATION_S}
				max={MAX_GAME_DURATION_S}
				onRangeChange={handleGameTimeRangeChange}
				labelText="Game Time Range"
			/>
			<TimeRangeFilter
				value={[
					value.minDurationS ?? MIN_GAME_DURATION_S,
					value.maxDurationS ?? MAX_GAME_DURATION_S,
				]}
				min={MIN_GAME_DURATION_S}
				max={MAX_GAME_DURATION_S}
				onRangeChange={handleDurationRangeChange}
				labelText="Match Duration"
			/>
			<HeroSelectorMultiple
				heroes={heroes}
				onSelect={handleHeroesChange}
				selected={value.heroIds?.split(",").map(Number) || []}
			/>
			<PatchOrDatePicker
				patchDates={PATCHES}
				value={{
					startDate: value.minUnixTimestamp
						? fromUnixTime(value.minUnixTimestamp)
						: undefined,
					endDate: value.maxUnixTimestamp
						? fromUnixTime(value.maxUnixTimestamp)
						: undefined,
				}}
				onValueChange={handleDateChange}
			/>
			<div className="flex items-center space-x-2">
				<Switch
					id="team"
					checked={value.team === 1}
					onCheckedChange={handleTeamChange}
				/>
				<Label htmlFor="team">Team {value.team}</Label>
			</div>
		</div>
	);
}
