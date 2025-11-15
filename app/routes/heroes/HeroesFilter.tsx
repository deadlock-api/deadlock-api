import type { HeroV2, RankV2 } from "assets-deadlock-api-client";
import { fromUnixTime, getUnixTime } from "date-fns";
import { type AnalyticsApiHeroStatsRequest } from "deadlock-api-client";
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
	return (
		<div className="flex flex-wrap justify-center items-center w-full gap-8">
			<RankSelector
				ranks={ranks}
				onSelect={(badge) => {
					onChange({
						...value,
						minAverageBadge: badge ?? undefined,
					});
				}}
				selected={value.minAverageBadge ?? 0}
				label="Min Rank"
			/>
			<RankSelector
				ranks={ranks}
				onSelect={(badge) => {
					onChange({
						...value,
						maxAverageBadge: badge ?? undefined,
					});
				}}
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
				onValueChange={({ startDate, endDate }) =>
					onChange({
						...value,
						minUnixTimestamp: startDate ? getUnixTime(startDate) : undefined,
						maxUnixTimestamp: endDate ? getUnixTime(endDate) : undefined,
					})
				}
			/>
		</div>
	);
}
