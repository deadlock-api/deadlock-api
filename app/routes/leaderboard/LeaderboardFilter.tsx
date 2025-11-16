import type { HeroV2 } from "assets-deadlock-api-client";
import {
	type LeaderboardApiLeaderboardRequest,
	LeaderboardRegionEnum,
} from "deadlock-api-client";
import type { LeaderboardApiLeaderboardHeroRequest } from "deadlock-api-client/api";
import { useCallback } from "react";
import { HeroSelector } from "~/components/primitives/selectors/HeroSelector";
import { StringSelector } from "~/components/primitives/selectors/StringSelector";

export type LeaderboardFilterType =
	| LeaderboardApiLeaderboardHeroRequest
	| LeaderboardApiLeaderboardRequest;

export interface LeaderboardFilterProps {
	heroes: HeroV2[];
	value: LeaderboardFilterType;
	onChange: (filter: LeaderboardFilterType) => void;
}

export function LeaderboardFilter({
	heroes,
	value,
	onChange,
}: LeaderboardFilterProps) {
	const regions = Object.values(LeaderboardRegionEnum);

	const handleHeroSelect = useCallback(
		(heroId: number | null) =>
			onChange({
				...value,
				heroId: heroId ?? undefined,
			}),
		[onChange, value],
	);

	const handleRegionSelect = useCallback(
		(region: string | null) => {
			if (region)
				onChange({
					...value,
					region: region as LeaderboardRegionEnum,
				});
		},
		[onChange, value],
	);

	return (
		<div className="flex flex-wrap justify-center items-center w-full gap-8">
			<HeroSelector
				heroes={heroes}
				onSelect={handleHeroSelect}
				selected={"heroId" in value ? (value.heroId ?? null) : null}
				allowSelectNull
			/>
			<StringSelector
				label={"Region"}
				placeholder={"Select Region..."}
				values={regions}
				selected={value.region}
				onSelect={handleRegionSelect}
			/>
		</div>
	);
}
