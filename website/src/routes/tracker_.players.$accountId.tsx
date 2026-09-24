import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { FeedbackNoticeDialog } from "~/components/features/tracker/shared/FeedbackNoticeDialog";
import { TrackerGate } from "~/components/features/tracker/shared/TrackerGate";
import { TrackerContent } from "~/components/features/tracker/TrackerContent";
import { PatronAuthProvider } from "~/contexts/PatronAuthContext";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { pageTitle, seo } from "~/lib/seo";
import { parseSteamIdToId3 } from "~/lib/steam";
import { isDemoAccount } from "~/lib/tracker/demo";
import { heroesQueryOptions } from "~/queries/asset-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";
import { steamProfileQueryOptions } from "~/queries/tracker-queries";

export const Route = createFileRoute("/tracker_/players/$accountId")({
  component: TrackerRoute,
  loader: async ({ context: { queryClient }, params }) => {
    const normalizedId = parseSteamIdToId3(params.accountId.trim());
    if (!/^\d+$/.test(normalizedId)) throw notFound();
    const accountId = Number(normalizedId);
    if (!Number.isInteger(accountId) || accountId <= 0 || accountId > 4294967295) throw notFound();
    // Generated players have no history of their own, and the demo profile is the one page that says it is made up.
    if (isDemoAccount(accountId)) throw redirect({ to: "/tracker/demo", search: true });
    // Canonicalize alternate Steam ID formats to the numeric account ID.
    if (String(accountId) !== params.accountId) {
      throw redirect({ to: "/tracker/players/$accountId", params: { accountId: String(accountId) }, search: true });
    }
    const [profile] = await Promise.all([
      prefetchSafe(queryClient.query({ ...steamProfileQueryOptions(accountId), staleTime: "static" })),
      prefetchSafe(queryClient.query({ ...heroesQueryOptions, staleTime: "static" })),
      prefetchSafe(queryClient.query({ ...ranksQueryOptions, staleTime: "static" })),
    ]);
    return { accountId, personaname: profile?.personaname, breadcrumb: profile?.personaname ?? String(accountId) };
  },
  head: ({ loaderData }) => {
    const name = loaderData?.personaname ?? (loaderData ? `Player ${loaderData.accountId}` : undefined);
    const base = seo({
      title: pageTitle(name ? `${name} - Player Tracker` : "Deadlock Player Tracker"),
      description: name
        ? `Full Deadlock match history, rank progression, hero breakdowns, and mate & opponent analytics for ${name}.`
        : "Full Deadlock match history, rank progression, hero breakdowns, and mate & opponent analytics for prioritized players.",
      path: loaderData ? `/tracker/players/${loaderData.accountId}` : "/tracker",
    });
    // A profile opens only for the patron who owns the account; a crawler would index a sign-in gate under the name.
    return { ...base, meta: [...base.meta, { name: "robots", content: "noindex, follow" }] };
  },
});

function TrackerRoute() {
  const { accountId } = Route.useLoaderData();
  return (
    <PatronAuthProvider>
      <TrackerGate accountId={accountId}>
        <TrackerContent accountId={accountId} notice={<FeedbackNoticeDialog />} />
      </TrackerGate>
    </PatronAuthProvider>
  );
}
