import { day } from "~/dayjs";

/** Deterministic hash from date string */
export function getDailySeed(date: string): number {
	let hash = 0;
	for (const char of date) {
		hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
	}
	return Math.abs(hash);
}

/** Mulberry32 PRNG — returns a function that produces deterministic floats [0, 1) */
export function seededRandom(seed: number): () => number {
	let s = seed;
	return () => {
		s |= 0;
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Pick one item from array using seeded random */
export function seededPick<T>(arr: readonly T[], rng: () => number): T {
	return arr[Math.floor(rng() * arr.length)];
}

/** Shuffle array in-place using Fisher-Yates with seeded random */
export function seededShuffle<T>(arr: T[], rng: () => number): T[] {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

/** Today's date as YYYY-MM-DD */
export function getTodayDate(): string {
	return day().format("YYYY-MM-DD");
}

/** Day number since epoch (for share text "Deadlockdle #N") */
export function getDayNumber(date: string): number {
	const epoch = day("2026-03-09");
	return day(date).diff(epoch, "day") + 1;
}
