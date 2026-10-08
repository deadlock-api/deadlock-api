import type { PatchInfo } from "~/lib/constants";

// The lookups take the patch list (`PATCHES`, newest first) as an argument: constants.ts reads `import.meta.env`, which
// plain Node tests can't load.

/** How long a patch is measured on each side of its start. */
export const PATCH_WINDOW_DAYS = 14;

const WINDOW_S = PATCH_WINDOW_DAYS * 24 * 60 * 60;

/** The patch pages' headline numbers cover Phantom 1 and up, like the hero and item pages' default. */
export const PATCH_MIN_BADGE = 91;

/** How many of the newest patches are open to search engines while the page type proves itself. */
export const INDEXED_PATCHES = 3;

export interface UnixWindow {
  minUnixTimestamp: number;
  maxUnixTimestamp: number;
}

export interface PatchWindows {
  /** The 14 days before the patch. */
  before: UnixWindow;
  /** Up to 14 days from the patch, cut short where the next patch starts. */
  after: UnixWindow;
}

export function getPatch(patches: readonly PatchInfo[], id: string): PatchInfo | undefined {
  return patches.find((patch) => patch.id === id);
}

/** The patch that came before. */
export function previousPatch(patches: readonly PatchInfo[], id: string): PatchInfo | undefined {
  const index = patches.findIndex((patch) => patch.id === id);
  return index === -1 ? undefined : patches[index + 1];
}

/** The patch that came after, if any. */
export function nextPatch(patches: readonly PatchInfo[], id: string): PatchInfo | undefined {
  const index = patches.findIndex((patch) => patch.id === id);
  return index <= 0 ? undefined : patches[index - 1];
}

/**
 * Fixed bounds that never depend on "now": a window still running ends in the future and the API answers up to the
 * present, so the query keys stay the same on the server, in the browser and from one day to the next.
 */
export function patchWindows(patch: PatchInfo): PatchWindows {
  const start = patch.startDate.unix();
  const end = Math.min(start + WINDOW_S, patch.endDate?.unix() ?? Number.POSITIVE_INFINITY);
  return {
    before: { minUnixTimestamp: start - WINDOW_S, maxUnixTimestamp: start },
    after: { minUnixTimestamp: start, maxUnixTimestamp: end },
  };
}

/** Whether the after window is over, so its numbers can no longer change. */
export function isSettled(windows: PatchWindows, nowUnix: number): boolean {
  return nowUnix >= windows.after.maxUnixTimestamp;
}

/** Days of data in a window up to `nowUnix`, at least 0. */
export function windowDays(window: UnixWindow, nowUnix: number): number {
  const end = Math.min(window.maxUnixTimestamp, nowUnix);
  return Math.max(0, (end - window.minUnixTimestamp) / 86_400);
}

/** Only the newest few patch pages are indexable. */
export function isIndexedPatch(patches: readonly PatchInfo[], id: string): boolean {
  return patches.slice(0, INDEXED_PATCHES).some((patch) => patch.id === id);
}
