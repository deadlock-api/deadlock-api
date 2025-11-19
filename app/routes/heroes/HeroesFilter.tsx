import type { HeroV2, RankV2 } from "assets-deadlock-api-client";
import { fromUnixTime, getUnixTime } from "date-fns";
import { type AnalyticsApiHeroStatsRequest } from "deadlock-api-client";
import { useCallback } from "react";
import { PatchOrDatePicker } from "~/components/primitives/PatchOrDatePicker";
import { RankSelector } from "~/components/primitives/selectors/RankSelector";
import { PATCHES } from "~/lib/consts";

export interface HeroesFilterProps {
	heroes: HeroV2[];
	ranks: RankV2[];
	value: AnalyticsApiHeroStatsRequest;
	onChange: (filter: AnalyticsApiHeroStatsRequest) => void;
}

export function HeroesFilter({
	heroes,
	ranks,
	value,
	onChange,
}: HeroesFilterProps) {
	const handleMinRankSelect = useCallback(
		(badge: number | null) => {
			onChange({
				...value,
				minAverageBadge: badge ?? undefined,
			});
		},
		[onChange, value],
	);

	const handleMaxRankSelect = useCallback(
		(badge: number | null) =>
			onChange({
				...value,
				maxAverageBadge: badge ?? undefined,
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

	return (
		<div className="flex flex-wrap justify-center items-center w-full gap-8">
			<RankSelector
				ranks={ranks}
				onSelect={handleMinRankSelect}
				selected={value.minAverageBadge ?? 0}
				label="Min Rank"
			/>
			<RankSelector
				ranks={ranks}
				onSelect={handleMaxRankSelect}
				selected={value.maxAverageBadge ?? 0}
				label="Max Rank"
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
		</div>
	);
}
