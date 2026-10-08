import { createServerFn } from "@tanstack/react-start";

import { api } from "~/lib/api";
import { PATCHES } from "~/lib/constants";
import { type PatchNotes, parsePatchNotes } from "~/lib/patch-notes";
import { mergePatchFeed, type PatchEntry, type PatchFeedItem, patchNotesContent, toPatchEntry } from "~/lib/patches";

/**
 * Every patch, newest first: the forum changelog and Steam news of `/v2/patches`, one entry per release, over the
 * curated `PATCHES`. The feed carries every post's full notes (~90 KB); the Worker keeps them and sends the list. When
 * the feed fails, the curated patches still make a list.
 */
export const fetchPatchList = createServerFn({ method: "GET" }).handler(async (): Promise<PatchEntry[]> => {
  const curated = PATCHES.map(toPatchEntry);
  try {
    const { data } = await api.patches_api.feed_1();
    // The generated types leave out the `source` tag the API puts on every item.
    const feed = data.map((item): PatchFeedItem => ({
      source: (item as { source?: string }).source === "steam" ? "steam" : "forum",
      title: item.title,
      pub_date: item.pub_date,
    }));
    return mergePatchFeed(feed, curated);
  } catch (error) {
    console.error("patch feed failed, using the curated patches", error);
    return mergePatchFeed([], curated);
  }
});

/** A patch's announcement or changelog, as plain text blocks; undefined when the feed has no post for its day. */
export const fetchPatchNotes = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }): Promise<PatchNotes | undefined> => {
    const { data } = await api.patches_api.feed_1();
    const feed = data.map((item): PatchFeedItem => ({
      source: (item as { source?: string }).source === "steam" ? "steam" : "forum",
      title: item.title,
      pub_date: item.pub_date,
      content: item.content,
    }));
    const html = patchNotesContent(feed, id);
    return html ? parsePatchNotes(html) : undefined;
  });
