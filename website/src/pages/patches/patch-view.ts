import type { QueryClient } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";

import { formatPercent } from "~/lib/format";
import { fetchPatchNotes } from "~/lib/patch-list-fns";
import { fetchPatchReport } from "~/lib/patch-report-fns";
import {
  getPatch,
  isIndexedPatch,
  patchLabel,
  patchWindows,
  previousPatch,
  windowDays,
  type PatchEntry,
} from "~/lib/patches";
import { catchPrefetch, ensureCached } from "~/lib/prefetch-safe";
import { pageTitle, seo } from "~/lib/seo";
import { heroesQueryOptions } from "~/queries/asset-queries";
import { patchListQueryOptions } from "~/queries/patch-list-query";

/** Below this many Phantom+ matches since the patch, the page shows an empty state and stays out of search. */
const MIN_MATCHES = 1_000;

/** "+3.1 pp" for a win rate change. */
function points(delta: number): string {
  return `${delta > 0 ? "+" : "−"}${formatPercent(Math.abs(delta)).replace("%", " pp")}`;
}

/** The patch list, cached for the whole session: the sidebar and every patch view read it. */
export function loadPatchList(queryClient: QueryClient): Promise<PatchEntry[]> {
  return ensureCached(queryClient, patchListQueryOptions);
}

/** One patch's view: `patchId`, or the newest patch when there is none. */
export async function loadPatchView(queryClient: QueryClient, patchId?: string) {
  const patches = await loadPatchList(queryClient);
  const patch = patchId === undefined ? patches[0] : getPatch(patches, patchId);
  if (!patch) throw notFound();
  const windows = patchWindows(patch, previousPatch(patches, patch.id));
  const [report, heroes, notes] = await Promise.all([
    catchPrefetch(fetchPatchReport({ data: windows })),
    catchPrefetch(ensureCached(queryClient, heroesQueryOptions)),
    catchPrefetch(fetchPatchNotes({ data: patch.id })),
  ]);
  const hasData = !!report && (report.matches.after ?? 0) >= MIN_MATCHES;
  // The title and description quote the same movers the page lists first.
  const name = (id: number | undefined) => heroes?.find((hero) => hero.id === id)?.name;
  const mover = (change: { id: number; winRateDelta: number | null } | undefined) => {
    const heroName = name(change?.id);
    return change?.winRateDelta != null && heroName ? { name: heroName, delta: change.winRateDelta } : null;
  };
  return {
    patch,
    isLatest: patch.id === patches[0]?.id,
    breadcrumb: patchLabel(patch),
    report: report ?? undefined,
    notes,
    hasData,
    days: { before: windowDays(windows.before, Infinity), after: windowDays(windows.after, Date.now() / 1000) },
    indexable: hasData && isIndexedPatch(patches, patch.id),
    gain: hasData ? mover(report?.heroMovers.gains[0]) : null,
    drop: hasData ? mover(report?.heroMovers.drops[0]) : null,
  };
}

export type PatchView = Awaited<ReturnType<typeof loadPatchView>>;

/**
 * The newest patch lives at `/patches`, so its own address points there; the others are their own page. `title`
 * replaces the patch's own title on `/patches`.
 */
export function patchHead(view: PatchView, title?: string) {
  const label = patchLabel(view.patch);
  const { gain, drop } = view;
  const movers = [gain && `${gain.name} ${points(gain.delta)}`, drop && `${drop.name} ${points(drop.delta)}`]
    .filter(Boolean)
    .join(", ");
  const description = movers
    ? `Deadlock ${label} win rate changes: ${movers}. The biggest hero, item and game stat changes, from Phantom+ matches.`
    : `How the Deadlock ${label} changed hero and item win rates, builds and game stats, from Phantom+ matches.`;
  const base = seo({
    title: pageTitle(title ?? `Deadlock ${label}: Win Rate Changes`),
    description,
    path: view.isLatest ? "/patches" : `/patches/${view.patch.id}`,
  });
  return view.indexable || view.isLatest
    ? base
    : { ...base, meta: [...base.meta, { name: "robots", content: "noindex, follow" }] };
}
