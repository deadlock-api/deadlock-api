import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { MatchPage } from "~/components/features/tracker/matches/MatchPage";
import { prefetchCached } from "~/lib/prefetch-safe";
import { pageTitle, seo } from "~/lib/seo";
import { ranksQueryOptions } from "~/queries/ranks-query";
import { matchSummaryQueryOptions } from "~/queries/tracker-queries";

const MAX_ACCOUNT_ID = 4294967295;

/** `?player=` sees the match through that player; anything else is dropped. */
function validateSearch(search: Record<string, unknown>): { player?: number } {
  const player = Number(search.player);
  return Number.isInteger(player) && player > 0 && player <= MAX_ACCOUNT_ID ? { player } : {};
}

export const Route = createFileRoute("/matches/$matchId")({
  validateSearch,
  component: MatchRoute,
  loader: async ({ context: { queryClient }, params }) => {
    const raw = params.matchId.trim();
    if (!/^\d+$/.test(raw)) throw notFound();
    const matchId = Number(raw);
    if (!Number.isSafeInteger(matchId) || matchId <= 0) throw notFound();
    if (String(matchId) !== params.matchId) {
      throw redirect({ to: "/matches/$matchId", params: { matchId: String(matchId) }, search: true });
    }
    await Promise.all([
      prefetchCached(queryClient, matchSummaryQueryOptions(matchId)),
      prefetchCached(queryClient, ranksQueryOptions),
    ]);
    return { matchId, breadcrumb: `Match ${matchId}` };
  },
  head: ({ loaderData }) => {
    const base = seo({
      title: pageTitle(loaderData ? `Match ${loaderData.matchId}` : "Deadlock Match"),
      description: "A Deadlock match: the soul lead over time, every kill and objective, and each player's build.",
      path: loaderData ? `/matches/${loaderData.matchId}` : "/",
    });
    // One page per match ID would flood the index; search and links reach them.
    return { ...base, meta: [...base.meta, { name: "robots", content: "noindex, follow" }] };
  },
});

function MatchRoute() {
  const { matchId } = Route.useLoaderData();
  const { player } = Route.useSearch();
  return <MatchPage matchId={matchId} accountId={player} />;
}
