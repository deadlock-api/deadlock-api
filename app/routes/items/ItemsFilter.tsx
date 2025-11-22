import type { HeroV2, RankV2 } from "assets-deadlock-api-client";
import type { ItemTierV2 } from "assets-deadlock-api-client/api";
import { fromUnixTime, getUnixTime } from "date-fns";
import { type AnalyticsApiItemStatsRequest } from "deadlock-api-client";
import { useCallback } from "react";
import { PatchOrDatePicker } from "~/components/primitives/PatchOrDatePicker";
import { HeroSelectorMultiple } from "~/components/primitives/selectors/HeroSelector";
import { RankSelector } from "~/components/primitives/selectors/RankSelector";
import { TierSelector } from "~/components/primitives/selectors/TierSelector";
import { PATCHES } from "~/lib/consts";

export interface ItemsFilterProps {
	heroes: HeroV2[];
	ranks: RankV2[];
	value: AnalyticsApiItemStatsRequest & { tierIds?: ItemTierV2[] };
	onChange: (
		filter: AnalyticsApiItemStatsRequest & { tierIds?: ItemTierV2[] },
	) => void;
}

export function ItemsFilter({
	heroes,
	ranks,
	value,
	onChange,
}: ItemsFilterProps) {
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

	const handleHeroIdsChange = useCallback(
		(heroIds: number[] | null) => {
			onChange({
				...value,
				heroIds: heroIds?.join(",") || null,
			});
		},
		[onChange, value],
	);

	const handleTierIdsChange = useCallback(
		(tierIds: ItemTierV2[]) => {
			onChange({
				...value,
				tierIds: tierIds.length > 0 ? tierIds : undefined,
			});
		},
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
			<HeroSelectorMultiple
				heroes={heroes}
				onSelect={handleHeroIdsChange}
				selected={value.heroIds ? value.heroIds.split(",").map(Number) : []}
			/>
			<TierSelector
				selected={value.tierIds ?? []}
				onSelectionChange={handleTierIdsChange}
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
