import { useQuery } from "@tanstack/react-query";
import type { Dayjs } from "dayjs";
import {
	createContext,
	useCallback,
	useContext,
	useLayoutEffect,
	useMemo,
	useReducer,
	useRef,
} from "react";

import { getRankLabel } from "~/lib/rank-utils";
import { heroesQueryOptions } from "~/queries/asset-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";

// --- Context for automatic filter description assembly ---

interface FilterDescriptionContextValue {
	register: (key: string, value: string | null) => void;
}

const FilterDescCtx = createContext<FilterDescriptionContextValue | null>(null);

/**
 * Call from inside a Filter.* sub-component to register a description fragment.
 * When the value is null, the segment is removed from the description.
 */
export function useRegisterFilterPart(
	key: string,
	value: string | null | undefined,
) {
	const ctx = useContext(FilterDescCtx);
	useLayoutEffect(() => {
		ctx?.register(key, value ?? null);
		return () => {
			ctx?.register(key, null);
		};
	}, [ctx, key, value]);
}

// --- Sentence builder ---

function Hl({ children }: { children: React.ReactNode }) {
	return <span className="font-medium text-foreground/80">{children}</span>;
}

/**
 * Ordered segment definitions. Each entry defines a key (or key prefix for
 * dynamic keys like "minMatches:*"), a prefix phrase, and whether the value
 * itself is highlighted.
 */
const SEGMENT_DEFS: {
	key: string;
	prefix: string;
	dynamic?: boolean;
}[] = [
	{ key: "gameMode", prefix: "" },
	{ key: "dateRange", prefix: "between" },
	{ key: "rankRange", prefix: "with rank" },
	{ key: "hero", prefix: "on" },
	{ key: "team", prefix: "on team" },
	{ key: "region", prefix: "in" },
	{ key: "viewMode", prefix: "showing" },
	{ key: "dimension", prefix: "in" },
	{ key: "items", prefix: "with" },
	{ key: "minMatches:", prefix: "requiring", dynamic: true },
	{ key: "sortBy", prefix: "sorted by" },
	{ key: "sortDir", prefix: "" },
	{ key: "duration", prefix: "lasting" },
	{ key: "timeRange", prefix: "purchased" },
];

function buildSentence(parts: Map<string, string>): React.ReactNode[] | null {
	if (parts.size === 0) return null;

	const segments: React.ReactNode[] = ["Showing data from"];

	for (const def of SEGMENT_DEFS) {
		if (def.dynamic) {
			// Collect all keys with this prefix (e.g. "minMatches:label1", "minMatches:label2")
			const matches: string[] = [];
			for (const [k, v] of parts) {
				if (k.startsWith(def.key)) matches.push(v);
			}
			if (matches.length > 0) {
				segments.push(
					<span key={def.key}>
						{def.prefix}{" "}
						{matches.map((v, i) => (
							<span key={v}>
								{i > 0 ? ", " : ""}
								<Hl>{v}</Hl>
							</span>
						))}
					</span>,
				);
			}
		} else {
			const value = parts.get(def.key);
			if (!value) continue;

			// "gameMode" has no prefix, directly push the highlighted value
			// followed by "matches"
			if (def.key === "gameMode") {
				segments.push(<Hl key={def.key}>{value}</Hl>);
				segments.push("matches");
				continue;
			}

			segments.push(
				<span key={def.key}>
					{def.prefix} <Hl>{value}</Hl>
				</span>,
			);
		}
	}

	return segments;
}

export function FilterDescriptionProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const partsRef = useRef(new Map<string, string>());
	const [renderCount, forceUpdate] = useReducer((x: number) => x + 1, 0);

	const register = useCallback((key: string, value: string | null) => {
		const prev = partsRef.current.get(key);
		if (value != null) {
			if (prev === value) return;
			partsRef.current.set(key, value);
		} else {
			if (!partsRef.current.has(key)) return;
			partsRef.current.delete(key);
		}
		forceUpdate();
	}, []);

	const ctxValue = useMemo(() => ({ register }), [register]);

	// renderCount is used as a dependency to recompute when parts change
	// biome-ignore lint/correctness/useExhaustiveDependencies: renderCount tracks ref mutations
	const sentence = useMemo(
		() => buildSentence(partsRef.current),
		[renderCount],
	);

	return (
		<FilterDescCtx.Provider value={ctxValue}>
			{children}
			{sentence && (
				<p className="w-full text-center text-xs text-muted-foreground">
					{sentence.map((segment, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: stable ordered list
						<span key={i}>
							{i > 0 ? " " : ""}
							{segment}
						</span>
					))}
					.
				</p>
			)}
		</FilterDescCtx.Provider>
	);
}

// --- Formatter helpers ---

/**
 * Format a date range using the browser's locale.
 */
export function formatDateRange(
	startDate: Dayjs | null | undefined,
	endDate: Dayjs | null | undefined,
): string | null {
	if (!startDate && !endDate) return null;
	const fmt = (d: Dayjs) =>
		d.toDate().toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	const fmtShort = (d: Dayjs) =>
		d
			.toDate()
			.toLocaleDateString(undefined, { month: "short", day: "numeric" });

	if (startDate && endDate) {
		const sameYear = startDate.year() === endDate.year();
		if (sameYear) {
			return `${fmtShort(startDate)} - ${fmt(endDate)}`;
		}
		return `${fmt(startDate)} - ${fmt(endDate)}`;
	}
	if (startDate) return `since ${fmt(startDate)}`;
	if (endDate) return `until ${fmt(endDate)}`;
	return null;
}

/**
 * Format a game mode into a readable string.
 */
export function formatGameMode(
	gameMode: string | null | undefined,
): string | null {
	if (!gameMode || gameMode === "normal") return "Ranked";
	if (gameMode === "street_brawl") return "Street Brawl";
	return gameMode;
}

/**
 * Hook that returns a rank label formatter using the cached ranks data.
 */
export function useRankLabel() {
	const { data: ranks } = useQuery(ranksQueryOptions);

	return useMemo(() => {
		if (!ranks) return () => null;

		const rankMap = new Map<number, string>();
		for (const rank of ranks) {
			if (rank.tier === 0) {
				rankMap.set(0, getRankLabel(rank, 1));
			} else {
				for (let sub = 1; sub <= 6; sub++) {
					rankMap.set(rank.tier * 10 + sub, getRankLabel(rank, sub));
				}
			}
		}

		return (rankId: number | null | undefined): string | null => {
			if (rankId == null) return null;
			return rankMap.get(rankId) ?? null;
		};
	}, [ranks]);
}

/**
 * Format a rank range into a readable string like "above Phantom 1",
 * "below Eternus 6", or "Phantom 1 - Eternus 6".
 */
export function formatRankRange(
	minRankId: number | null | undefined,
	maxRankId: number | null | undefined,
	labelFn: (rankId: number | null | undefined) => string | null,
	opts?: { defaultMin?: number; defaultMax?: number },
): string | null {
	const isDefaultMin = minRankId == null || minRankId === opts?.defaultMin;
	const isDefaultMax = maxRankId == null || maxRankId === opts?.defaultMax;
	if (isDefaultMin && isDefaultMax) return null;

	const minLabel = labelFn(minRankId);
	const maxLabel = labelFn(maxRankId);

	if (!minLabel && !maxLabel) return null;
	if (minLabel && maxLabel) {
		if (minRankId === maxRankId) return minLabel;
		if (isDefaultMin) return `below ${maxLabel}`;
		if (isDefaultMax) return `above ${minLabel}`;
		return `${minLabel} - ${maxLabel}`;
	}
	if (minLabel) return `above ${minLabel}`;
	if (maxLabel) return `below ${maxLabel}`;
	return null;
}

/**
 * Format seconds into a human-readable time like "5m - 30m" or "after 15m".
 */
export function formatTimeRange(
	minSeconds: number | null | undefined,
	maxSeconds: number | null | undefined,
	defaultMin?: number,
	defaultMax?: number,
): string | null {
	const isDefaultMin = minSeconds == null || minSeconds === defaultMin;
	const isDefaultMax = maxSeconds == null || maxSeconds === defaultMax;
	if (isDefaultMin && isDefaultMax) return null;

	const fmtTime = (s: number) => `${Math.floor(s / 60)}m`;

	if (
		!isDefaultMin &&
		!isDefaultMax &&
		minSeconds != null &&
		maxSeconds != null
	)
		return `${fmtTime(minSeconds)} - ${fmtTime(maxSeconds)}`;
	if (!isDefaultMin && minSeconds != null)
		return `after ${fmtTime(minSeconds)}`;
	if (!isDefaultMax && maxSeconds != null)
		return `before ${fmtTime(maxSeconds)}`;
	return null;
}

/**
 * Format a min-matches filter value. Returns null when value is 0 (default).
 */
export function formatMinMatches(value: number, label: string): string | null {
	if (value <= 0) return null;
	// Strip leading "Min " from labels like "Min Matches", "Min Hero Matches (Total)"
	const shortLabel = label.replace(/^Min\s+/i, "").toLowerCase();
	return `min. ${value} ${shortLabel}`;
}

/**
 * Hook that returns a hero name lookup function using cached hero assets.
 */
export function useHeroName() {
	const { data: heroes } = useQuery(heroesQueryOptions);

	return useMemo(() => {
		if (!heroes) return () => null;
		const map = new Map<number, string>();
		for (const hero of heroes) {
			map.set(hero.id, hero.name);
		}
		return (heroId: number | null | undefined): string | null => {
			if (heroId == null) return null;
			return map.get(heroId) ?? null;
		};
	}, [heroes]);
}
