import { day } from "~/dayjs";
import type { PatchInfo } from "~/lib/constants";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";

// Everything here takes the patch list as an argument: the list comes from the API at runtime, and constants.ts reads
// `import.meta.env`, which plain Node tests can't load.

/** How long a patch is measured on each side of its start, at most. */
export const PATCH_WINDOW_DAYS = 7;

const DAY_S = 24 * 60 * 60;
const WINDOW_S = PATCH_WINDOW_DAYS * DAY_S;

/** The patch pages' headline numbers cover Phantom 1 and up, like the hero and item pages' default. */
export const PATCH_MIN_BADGE = 91;

/** How many of the newest patches are open to search engines while the page type proves itself. */
export const INDEXED_PATCHES = 3;

/** A patch as the patch pages list it: plain numbers, so it passes from the server to the page unchanged. */
export interface PatchEntry {
  /** The release day, `YYYY-MM-DD`: the address of its page. */
  id: string;
  name: string;
  /** "Patch" for a plain update, otherwise its own name ("City Never Sleeps"). */
  shortName: string;
  startUnix: number;
  /** Undefined for the patch still running. */
  endUnix?: number;
}

/** One post of the `/v2/patches` feed: the official forum changelog and the Steam news, mixed. */
export interface PatchFeedItem {
  source: "forum" | "steam";
  title: string;
  pub_date: string;
}

export interface UnixWindow {
  minUnixTimestamp: number;
  maxUnixTimestamp: number;
}

export interface PatchWindows {
  /** Up to 7 days before the patch, from where the patch before it started at the earliest. */
  before: UnixWindow;
  /** Up to 7 days from the patch, until the next patch at the latest. */
  after: UnixWindow;
}

/** A curated patch of `PATCHES`, as an entry. */
export function toPatchEntry(patch: PatchInfo): PatchEntry {
  return {
    id: patch.id,
    name: patch.name,
    shortName: patch.shortName,
    startUnix: patch.startDate.unix(),
    endUnix: patch.endDate?.unix(),
  };
}

/** "09-16-2026" in a title, as `2026-09-16`. */
function titleDay(title: string): string | undefined {
  const match = /(\d{2})-(\d{2})-(\d{4})/.exec(title);
  return match ? `${match[3]}-${match[1]}-${match[2]}` : undefined;
}

/** A post's time counts as the release only when it went up within two days of the release day. */
const RELEASE_SLACK_S = 2 * DAY_S;

/**
 * A backfilled post (a changelog thread posted weeks later) says nothing about the hour; Valve ships around midday
 * Pacific time.
 */
const USUAL_RELEASE_HOUR_UTC = 20;

/**
 * Every patch the feed knows, newest first, one entry per release day. The forum and Steam announce most patches
 * twice: the forum by its date ("09-16-2026 Update"), Steam by its date or its name ("City Never Sleeps"). A Steam post
 * without a date counts only when it is an update or the forum has a patch that day, which leaves out the hero
 * spotlights. A curated patch keeps its name and exact start, and stays even when the feed no longer reaches back to
 * it.
 */
export function mergePatchFeed(feed: readonly PatchFeedItem[], curated: readonly PatchEntry[]): PatchEntry[] {
  const posts = feed.map((item) => {
    const published = day.utc(item.pub_date);
    return { ...item, title: item.title.trim(), published, day: titleDay(item.title) };
  });
  const forumDays = new Set(posts.flatMap((post) => (post.source === "forum" && post.day ? [post.day] : [])));
  const byDay = new Map<string, typeof posts>();
  for (const post of posts) {
    const id = post.day ?? post.published.format("YYYY-MM-DD");
    if (!post.day && !/update/i.test(post.title) && !forumDays.has(id)) continue;
    byDay.set(id, [...(byDay.get(id) ?? []), post]);
  }

  const entries = new Map(curated.map((patch) => [patch.id, { ...patch }]));
  for (const [id, group] of byDay) {
    if (entries.has(id)) continue;
    const releaseDay = day.utc(id);
    const onTime = (post: (typeof group)[number]) => {
      const offset = post.published.unix() - releaseDay.unix();
      return offset >= 0 && offset <= RELEASE_SLACK_S;
    };
    // Steam's post is the release itself; the forum thread is often written later, or edited with the next patch.
    const timed = group.find((post) => post.source === "steam" && onTime(post)) ?? group.find(onTime);
    const named = group.find((post) => post.source === "steam" && !post.day);
    const startUnix = timed ? timed.published.unix() : releaseDay.hour(USUAL_RELEASE_HOUR_UTC).unix();
    entries.set(id, {
      id,
      name: named ? `${named.title} (${id})` : `Update (${id})`,
      shortName: named ? named.title : "Patch",
      startUnix,
    });
  }

  const sorted = [...entries.values()].sort((a, b) => b.startUnix - a.startUnix);
  // Each patch runs until the next one starts.
  sorted.forEach((patch, index) => {
    patch.endUnix = index === 0 ? undefined : sorted[index - 1].startUnix;
  });
  return sorted;
}

export function getPatch(patches: readonly PatchEntry[], id: string): PatchEntry | undefined {
  return patches.find((patch) => patch.id === id);
}

/** The patch that came before. */
export function previousPatch(patches: readonly PatchEntry[], id: string): PatchEntry | undefined {
  const index = patches.findIndex((patch) => patch.id === id);
  return index === -1 ? undefined : patches[index + 1];
}

/**
 * Fixed bounds that never depend on "now": a window still running ends in the future and the API answers up to the
 * present, so the query keys stay the same on the server, in the browser and from one day to the next. Each side
 * stops at the neighbouring patch, so a hotfix two days after a big patch compares with those two days, not with the
 * game before the big one.
 */
export function patchWindows(patch: PatchEntry, previous: PatchEntry | undefined): PatchWindows {
  const start = patch.startUnix;
  return {
    before: { minUnixTimestamp: Math.max(start - WINDOW_S, previous?.startUnix ?? 0), maxUnixTimestamp: start },
    after: { minUnixTimestamp: start, maxUnixTimestamp: Math.min(start + WINDOW_S, patch.endUnix ?? Infinity) },
  };
}

/** Whether the after window is over, so its numbers can no longer change. */
export function isSettled(windows: PatchWindows, nowUnix: number): boolean {
  return nowUnix >= windows.after.maxUnixTimestamp;
}

/** Days of data in a window up to `nowUnix`, at least 0. */
export function windowDays(window: UnixWindow, nowUnix: number): number {
  const end = Math.min(window.maxUnixTimestamp, nowUnix);
  return Math.max(0, (end - window.minUnixTimestamp) / DAY_S);
}

/** Only the newest few patch pages are indexable. */
export function isIndexedPatch(patches: readonly PatchEntry[], id: string): boolean {
  return patches.slice(0, INDEXED_PATCHES).some((patch) => patch.id === id);
}

/** "Sep 29, 2026": the release day, as written in the patch's id. */
export function patchDate(patch: PatchEntry): string {
  return day.utc(patch.id).format("MMM D, YYYY");
}

/** What a patch is called in titles: its own name, or its date for a plain update ("Sep 16, 2026 Patch"). */
export function patchLabel(patch: PatchEntry): string {
  return `${patch.shortName === "Patch" ? patchDate(patch) : patch.shortName} Patch`;
}

/**
 * The patch as the analytics pages' `date_range`: its exact start and end, the range their patch picker selects for
 * a curated patch, so they compare it with the patch before.
 */
export function patchDateRange(patch: PatchEntry): string {
  return parseAsDayjsRange.serialize([
    day.unix(patch.startUnix),
    patch.endUnix === undefined ? undefined : day.unix(patch.endUnix),
  ]);
}
