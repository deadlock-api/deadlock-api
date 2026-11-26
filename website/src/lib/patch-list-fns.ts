import { createServerFn } from "@tanstack/react-start";

import { api } from "~/lib/api";
import { PATCHES } from "~/lib/constants";
import { type PatchNotes, parsePatchNotes } from "~/lib/patch-notes";
import { mergePatchFeed, type PatchEntry, type PatchFeedItem, patchNotesContent, toPatchEntry } from "~/lib/patches";

/** How long a Worker keeps the feed: every page with a date filter needs the patch list, and a new patch can wait this long. */
const FEED_TTL_MS = 10 * 60 * 1000;

// The answer only, never a pending request: a Worker cannot await another request's I/O.
let cachedFeed: { at: number; feed: PatchFeedItem[] } | undefined;

async function patchFeed(): Promise<PatchFeedItem[]> {
  if (cachedFeed && Date.now() - cachedFeed.at < FEED_TTL_MS) return cachedFeed.feed;
  const { data } = await api.patches_api.feedV2();
  // The generated types leave out the `source` tag the API puts on every item.
  const feed = data.map((item): PatchFeedItem => ({
    source: (item as { source?: string }).source === "steam" ? "steam" : "forum",
    title: item.title,
    pub_date: item.pub_date,
    content: item.content,
  }));
  cachedFeed = { at: Date.now(), feed };
  return feed;
}

/**
 * Every patch, newest first: the forum changelog and Steam news of `/v2/patches`, one entry per release, over the
 * curated `PATCHES`. The feed carries every post's full notes (~115 KB); the Worker reads them (a hero release is
 * known by its text) and sends only the list. When the feed fails, the curated patches still make a list.
 */
export const fetchPatchList = createServerFn({ method: "GET" }).handler(async (): Promise<PatchEntry[]> => {
  const curated = PATCHES.map(toPatchEntry);
  try {
    return mergePatchFeed(await patchFeed(), curated);
  } catch (error) {
    console.error("patch feed failed, using the curated patches", error);
    return mergePatchFeed([], curated);
  }
});

/** A patch's announcement or changelog, as plain text blocks; undefined when the feed has no post for its day. */
export const fetchPatchNotes = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }): Promise<PatchNotes | undefined> => {
    const html = patchNotesContent(await patchFeed(), id);
    return html ? parsePatchNotes(html) : undefined;
  });
