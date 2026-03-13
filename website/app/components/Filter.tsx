import { useQuery } from "@tanstack/react-query";
import { LeaderboardRegionEnum } from "deadlock_api_client";
import { ArrowDownNarrowWide, ArrowUpNarrowWide } from "lucide-react";
import { useMemo } from "react";

import {
	FilterDescriptionProvider,
	formatDateRange,
	formatGameMode,
	formatMinMatches,
	formatRankRange,
	formatTimeRange,
	useHeroName,
	useRankLabel,
	useRegisterFilterPart,
} from "~/components/FilterDescription";
import { ItemImage } from "~/components/ItemImage";
import { NumberSelector } from "~/components/NumberSelector";
import { PatchOrDatePicker } from "~/components/PatchOrDatePicker";
import {
	type GameMode,
	GameModeSelector,
} from "~/components/selectors/GameModeSelector";
import { HeroSelector } from "~/components/selectors/HeroSelector";
import { MatchTimeRangeSelector } from "~/components/selectors/MatchTimeRangeSelector";
import { RankRangeSelector } from "~/components/selectors/RankRangeSelector";
import { StringSelector } from "~/components/selectors/StringSelector";
import {
	type TriState,
	type TriStateColumnLayout,
	TriStateSelector,
} from "~/components/selectors/TriStateSelector";
import type { Dayjs } from "~/dayjs";
import { MAX_GAME_DURATION_S, PATCHES } from "~/lib/constants";
import { cn } from "~/lib/utils";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";

function Root({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"relative mx-auto flex w-fit flex-wrap items-center justify-center gap-2",
				"rounded-2xl border border-white/[0.06] bg-white/[0.03] px-5 py-3.5",
				"shadow-[0_0_0_1px_rgba(0,0,0,0.3),0_2px_8px_rgba(0,0,0,0.25)]",
				className,
			)}
		>
			<FilterDescriptionProvider>{children}</FilterDescriptionProvider>
		</div>
	);
}

function Hero({
	value,
	onChange,
	allowNull,
	label,
}: {
	value: number | null;
	onChange: (heroId: number | null) => void;
	allowNull?: boolean;
	label?: string;
}) {
	const heroName = useHeroName();
	useRegisterFilterPart("hero", value != null ? heroName(value) : null);

	return (
		<HeroSelector
			onHeroSelected={(x) => onChange(x ?? null)}
			selectedHero={value ?? undefined}
			allowSelectNull={allowNull}
			label={label}
		/>
	);
}

function MinMatches({
	value,
	onChange,
	label = "Min Matches",
	step = 10,
	min,
	max,
}: {
	value: number;
	onChange: (val: number) => void;
	label?: string;
	step?: number;
	min?: number;
	max?: number;
}) {
	useRegisterFilterPart(`minMatches:${label}`, formatMinMatches(value, label));

	return (
		<NumberSelector
			value={value}
			onChange={onChange}
			label={label}
			step={step}
			min={min}
			max={max}
		/>
	);
}

function GameModeOnly({
	value,
	onChange,
}: {
	value: GameMode;
	onChange: (mode: GameMode) => void;
}) {
	useRegisterFilterPart("gameMode", formatGameMode(value));

	return <GameModeSelector value={value} onChange={onChange} />;
}

function RankRangeOnly({
	minRank,
	maxRank,
	onRankChange,
	label,
}: {
	minRank: number;
	maxRank: number;
	onRankChange: (min: number, max: number) => void;
	label?: string;
}) {
	const rankLabel = useRankLabel();
	useRegisterFilterPart(
		"rankRange",
		formatRankRange(minRank, maxRank, rankLabel),
	);

	return (
		<RankRangeSelector
			minRank={minRank}
			maxRank={maxRank}
			onRankChange={onRankChange}
			label={label}
		/>
	);
}

function GameModeWithRank({
	gameMode,
	onGameModeChange,
	minRank,
	maxRank,
	onRankChange,
}: {
	gameMode: GameMode;
	onGameModeChange: (mode: GameMode) => void;
	minRank: number;
	maxRank: number;
	onRankChange: (min: number, max: number) => void;
}) {
	const rankLabel = useRankLabel();
	const isStreetBrawl = gameMode === "street_brawl";

	useRegisterFilterPart("gameMode", formatGameMode(gameMode));
	useRegisterFilterPart(
		"rankRange",
		isStreetBrawl ? null : formatRankRange(minRank, maxRank, rankLabel),
	);

	return (
		<>
			<GameModeSelector value={gameMode} onChange={onGameModeChange} />
			{!isStreetBrawl && (
				<RankRangeSelector
					minRank={minRank}
					maxRank={maxRank}
					onRankChange={onRankChange}
				/>
			)}
		</>
	);
}

function PatchOrDate({
	startDate,
	endDate,
	onDateChange,
	defaultTab,
}: {
	startDate?: Dayjs;
	endDate?: Dayjs;
	onDateChange: (
		startDate?: Dayjs,
		endDate?: Dayjs,
		prevStartDate?: Dayjs,
		prevEndDate?: Dayjs,
	) => void;
	defaultTab?: "patch" | "custom";
}) {
	useRegisterFilterPart("dateRange", formatDateRange(startDate, endDate));

	return (
		<PatchOrDatePicker
			patchDates={PATCHES}
			value={{ startDate, endDate }}
			onValueChange={({
				startDate: s,
				endDate: e,
				prevStartDate,
				prevEndDate,
			}) => onDateChange(s, e, prevStartDate, prevEndDate)}
			defaultTab={defaultTab}
		/>
	);
}

const regionOptions = Object.entries(LeaderboardRegionEnum).map(
	([key, val]) => ({
		label: key,
		value: val,
	}),
);

function Region({
	value,
	onChange,
}: {
	value: string;
	onChange: (region: string) => void;
}) {
	const label = regionOptions.find((o) => o.value === value)?.label ?? null;
	useRegisterFilterPart("region", label);

	return (
		<StringSelector
			label="Region"
			options={regionOptions}
			selected={value}
			onSelect={onChange}
		/>
	);
}

function TimeRange({
	minTime,
	maxTime,
	onTimeChange,
	label = "Time",
	title = "Match Time Window",
	description = "Filter by when events occurred in the match.",
	max,
	presets,
}: {
	minTime?: number;
	maxTime?: number;
	onTimeChange: (min: number | undefined, max: number | undefined) => void;
	label?: string;
	title?: string;
	description?: string;
	max?: number;
	presets?: { label: string; start: number; end: number }[] | null;
}) {
	useRegisterFilterPart("timeRange", formatTimeRange(minTime, maxTime, 0, max));

	return (
		<MatchTimeRangeSelector
			minTime={minTime}
			maxTime={maxTime}
			onTimeChange={onTimeChange}
			label={label}
			title={title}
			description={description}
			max={max}
			presets={presets}
		/>
	);
}

function MatchDuration({
	minTime,
	maxTime,
	onTimeChange,
}: {
	minTime?: number;
	maxTime?: number;
	onTimeChange: (min: number | undefined, max: number | undefined) => void;
}) {
	useRegisterFilterPart(
		"duration",
		formatTimeRange(minTime, maxTime, 0, MAX_GAME_DURATION_S),
	);

	return (
		<MatchTimeRangeSelector
			minTime={minTime}
			maxTime={maxTime}
			onTimeChange={onTimeChange}
			label="Duration"
			title="Match Duration"
			description="Filter matches by their total duration."
			max={MAX_GAME_DURATION_S}
			presets={[
				{ label: "Short (<20m)", start: 0, end: 20 * 60 },
				{ label: "Mid (20-40m)", start: 20 * 60, end: 40 * 60 },
				{ label: "Long (40m+)", start: 40 * 60, end: MAX_GAME_DURATION_S },
			]}
		/>
	);
}

const TEAMS = [
	{ value: 0, label: "The Hidden King" },
	{ value: 1, label: "The Archmother" },
] as const;

function Team({
	value,
	onChange,
}: {
	value: number;
	onChange: (team: number) => void;
}) {
	const teamLabel = TEAMS.find((t) => t.value === value)?.label ?? null;
	useRegisterFilterPart("team", teamLabel);

	return (
		<div className="inline-flex items-center rounded-full border border-white/[0.08] bg-secondary p-0.5">
			{TEAMS.map((team) => (
				<button
					key={team.value}
					type="button"
					onClick={() => onChange(team.value)}
					className={`cursor-pointer rounded-full px-3 py-1 text-sm transition-all ${
						value === team.value
							? "bg-primary text-primary-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground"
					}`}
				>
					{team.label}
				</button>
			))}
		</div>
	);
}

const VIEW_MODES = ["kills", "deaths", "kd"] as const;
type ViewMode = (typeof VIEW_MODES)[number];

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
	kills: "Kills",
	deaths: "Deaths",
	kd: "K/D",
};

function HeatmapViewMode({
	value,
	onChange,
}: {
	value: string;
	onChange: (mode: string) => void;
}) {
	useRegisterFilterPart(
		"viewMode",
		VIEW_MODE_LABELS[value as ViewMode] ?? value,
	);

	return (
		<div className="inline-flex items-center rounded-full border border-white/[0.08] bg-secondary p-0.5">
			{VIEW_MODES.map((mode) => (
				<button
					key={mode}
					type="button"
					onClick={() => onChange(mode)}
					className={`cursor-pointer rounded-full px-3 py-1 text-sm transition-all ${
						value === mode
							? "bg-primary text-primary-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground"
					}`}
				>
					{VIEW_MODE_LABELS[mode]}
				</button>
			))}
		</div>
	);
}

function DimensionToggle({
	value,
	onChange,
}: {
	value: boolean;
	onChange: (is3D: boolean) => void;
}) {
	useRegisterFilterPart("dimension", value ? "3D" : "2D");

	return (
		<div className="inline-flex items-center rounded-full border border-white/[0.08] bg-secondary p-0.5">
			<button
				type="button"
				onClick={() => onChange(false)}
				className={`cursor-pointer rounded-full px-3 py-1 text-sm transition-all ${
					!value
						? "bg-primary text-primary-foreground shadow-sm"
						: "text-muted-foreground hover:text-foreground"
				}`}
			>
				2D
			</button>
			<button
				type="button"
				onClick={() => onChange(true)}
				className={`cursor-pointer rounded-full px-3 py-1 text-sm transition-all ${
					value
						? "bg-primary text-primary-foreground shadow-sm"
						: "text-muted-foreground hover:text-foreground"
				}`}
			>
				3D
			</button>
		</div>
	);
}

const ITEM_COLUMN_LAYOUT: TriStateColumnLayout = {
	superGroups: [1, 2, 3, 4].map((tier) => ({
		key: String(tier),
		label: `Tier ${tier}`,
	})),
	columns: [
		{ key: "weapon", label: "Weapon", color: "rgb(229, 138, 0)" },
		{ key: "vitality", label: "Vitality", color: "rgb(0, 255, 153)" },
		{ key: "spirit", label: "Spirit", color: "rgb(0, 221, 255)" },
	],
};

function formatItemSelections(
	selections: Map<number, TriState>,
): string | null {
	if (selections.size === 0) return null;
	const included = [...selections.values()].filter(
		(v) => v === "included",
	).length;
	const excluded = [...selections.values()].filter(
		(v) => v === "excluded",
	).length;
	const parts: string[] = [];
	if (included > 0) parts.push(`${included} included`);
	if (excluded > 0) parts.push(`${excluded} excluded`);
	return `${parts.join(", ")} items`;
}

function ItemsTriState({
	selections,
	onSelectionsChange,
	label,
}: {
	selections: Map<number, TriState>;
	onSelectionsChange: (selections: Map<number, TriState>) => void;
	label?: string;
}) {
	useRegisterFilterPart("items", formatItemSelections(selections));

	const { data, isLoading } = useQuery(itemUpgradesQueryOptions);

	const options = useMemo(() => {
		if (!data) return [];
		return data
			.filter((i) => !i.disabled && i.shopable && i.shop_image_webp)
			.sort((a, b) => {
				if (a.item_tier !== b.item_tier) return a.item_tier - b.item_tier;
				const slotOrder = ["weapon", "vitality", "spirit"];
				const slotDiff =
					slotOrder.indexOf(a.item_slot_type) -
					slotOrder.indexOf(b.item_slot_type);
				if (slotDiff !== 0) return slotDiff;
				return a.name.localeCompare(b.name);
			})
			.map((item) => ({
				id: item.id,
				label: item.name,
				icon: (
					<ItemImage
						itemId={item.id}
						className="size-5 shrink-0 object-contain"
					/>
				),
				group: `${item.item_tier}-${item.item_slot_type}`,
			}));
	}, [data]);

	if (isLoading) return null;

	return (
		<TriStateSelector
			options={options}
			selections={selections}
			onSelectionsChange={onSelectionsChange}
			placeholder="Filter items..."
			label={label || "Items"}
			columnLayout={ITEM_COLUMN_LAYOUT}
		/>
	);
}

function SortBy({
	children,
	label,
}: {
	children: React.ReactNode;
	label: string | null | undefined;
}) {
	useRegisterFilterPart("sortBy", label ?? null);
	return <>{children}</>;
}

function SortDirection({
	value,
	onChange,
}: {
	value: "desc" | "asc";
	onChange: (dir: "desc" | "asc") => void;
}) {
	useRegisterFilterPart(
		"sortDir",
		value === "desc" ? "descending" : "ascending",
	);

	const isDesc = value === "desc";
	return (
		<button
			type="button"
			className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-white/[0.08] bg-secondary px-3 text-sm text-muted-foreground transition-all hover:border-white/[0.14] hover:bg-accent hover:text-foreground"
			onClick={() => onChange(isDesc ? "asc" : "desc")}
		>
			{isDesc ? (
				<ArrowDownNarrowWide className="size-3.5" />
			) : (
				<ArrowUpNarrowWide className="size-3.5" />
			)}
			<span>{isDesc ? "DESC" : "ASC"}</span>
		</button>
	);
}

export const Filter = {
	Root,
	Hero,
	Region,
	GameMode: GameModeOnly,
	RankRange: RankRangeOnly,
	GameModeWithRank,
	MinMatches,
	PatchOrDate,
	TimeRange,
	MatchDuration,
	HeatmapViewMode,
	DimensionToggle,
	ItemsTriState,
	SortBy,
	SortDirection,
	Team,
};
