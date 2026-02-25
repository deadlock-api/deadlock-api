import {
	type LeaderboardApiLeaderboardRequest,
	LeaderboardRegionEnum,
} from "deadlock_api_client";
import type { LeaderboardApiLeaderboardHeroRequest } from "deadlock_api_client/api";
import { useCallback } from "react";
import HeroSelector from "~/components/selectors/HeroSelector";
import { StringSelector } from "~/components/selectors/StringSelector";

export type LeaderboardFilterType =
	| LeaderboardApiLeaderboardHeroRequest
	| LeaderboardApiLeaderboardRequest;

export interface LeaderboardFilterProps {
	value: LeaderboardFilterType;
	onChange: (filter: LeaderboardFilterType) => void;
}

const regions = Object.entries(LeaderboardRegionEnum).map(([key, val]) => ({
	label: key,
	value: val,
}));

export function LeaderboardFilter({
	value,
	onChange,
}: LeaderboardFilterProps) {
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
		<div className="flex flex-col md:flex-row gap-4 md:gap-8 justify-center md:justify-start">
			<HeroSelector
				onHeroSelected={handleHeroSelect}
				selectedHero={"heroId" in value ? (value.heroId ?? null) : null}
				allowSelectNull
			/>
			<StringSelector
				label="Region"
				placeholder="Select Region..."
				options={regions}
				selected={value.region}
				onSelect={handleRegionSelect}
			/>
		</div>
	);
}
