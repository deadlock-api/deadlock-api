import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { MatchPage } from "~/components/features/tracker/matches/MatchPage";
import { MATCH_CARD_VERSION } from "~/lib/og/card-kit";
import { prefetchCached } from "~/lib/prefetch-safe";
import { pageTitle, seo, SITE_URL } from "~/lib/seo";
import { matchShareText } from "~/lib/tracker/match-share";
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
    const [summary, ranks] = await Promise.all([
      prefetchCached(queryClient, matchSummaryQueryOptions(matchId)),
      prefetchCached(queryClient, ranksQueryOptions),
    ]);
    // A link preview says what happened in the match; a match we do not have keeps the generic text.
    const share = summary ? matchShareText(matchId, summary, ranks) : undefined;
    return { matchId, share, breadcrumb: `Match ${matchId}` };
  },
  head: ({ loaderData }) => {
    const base = seo({
      title: pageTitle(loaderData?.share?.title ?? (loaderData ? `Match ${loaderData.matchId}` : "Deadlock Match")),
      description:
        loaderData?.share?.description ??
        "A Deadlock match: the soul lead over time, every kill and objective, and each player's build.",
      path: loaderData ? `/matches/${loaderData.matchId}` : "/",
      ogImage: loaderData?.share
        ? `${SITE_URL}/og/match.png?id=${loaderData.matchId}&v=${MATCH_CARD_VERSION}`
        : undefined,
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
