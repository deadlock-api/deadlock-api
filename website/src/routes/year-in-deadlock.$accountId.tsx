import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { TrackerGate } from "~/components/features/tracker/shared/TrackerGate";
import { YearRecapPage } from "~/components/features/year-recap/YearRecapPage";
import { PatronAuthProvider } from "~/contexts/PatronAuthContext";
import { IS_DEV } from "~/lib/constants";
import { prefetchCached } from "~/lib/prefetch-safe";
import { pageTitle, seo } from "~/lib/seo";
import { parseSteamIdToId3 } from "~/lib/steam";
import { isDemoAccount } from "~/lib/tracker/demo";
import { isRecapOpen, recapYear } from "~/lib/year-recap/availability";
import { heroesQueryOptions } from "~/queries/asset-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";
import { steamProfileQueryOptions } from "~/queries/steam-queries";

export const Route = createFileRoute("/year-in-deadlock/$accountId")({
  component: YearRecapRoute,
  loader: async ({ context: { queryClient }, params }) => {
    // Outside its window (1 December to 15 January) the recap does not exist: a 404, not an "opens soon" page.
    const now = new Date();
    if (!IS_DEV && !isRecapOpen(now)) throw notFound();
    const normalizedId = parseSteamIdToId3(params.accountId.trim());
    if (!/^\d+$/.test(normalizedId)) throw notFound();
    const accountId = Number(normalizedId);
    if (!Number.isInteger(accountId) || accountId <= 0 || accountId > 4294967295) throw notFound();
    // The demo profile's players are generated: they have no year to recap.
    if (isDemoAccount(accountId)) throw redirect({ to: "/year-in-deadlock" });
    // Canonicalize alternate Steam ID formats to the numeric account ID.
    if (String(accountId) !== params.accountId) {
      throw redirect({ to: "/year-in-deadlock/$accountId", params: { accountId: String(accountId) } });
    }
    // The recap itself loads in the browser: it is a few hundred kilobytes, too much to embed in the HTML.
    const [profile] = await Promise.all([
      prefetchCached(queryClient, steamProfileQueryOptions(accountId)),
      prefetchCached(queryClient, heroesQueryOptions),
      prefetchCached(queryClient, ranksQueryOptions),
    ]);
    return {
      accountId,
      year: recapYear(now),
      open: true,
      personaname: profile?.personaname,
      breadcrumb: profile?.personaname ?? String(accountId),
    };
  },
  head: ({ loaderData }) => {
    const name = loaderData?.personaname ?? (loaderData ? `Player ${loaderData.accountId}` : undefined);
    const year = loaderData?.year ?? "";
    const base = seo({
      title: pageTitle(name ? `${name}'s ${year} in Deadlock` : `Year in Deadlock ${year}`),
      description: name
        ? `${name}'s Deadlock year in review: hours played, heroes, ranked journey, best games, rivals and friends.`
        : "A Deadlock year in review: hours played, heroes, ranked journey, best games, rivals and friends.",
      path: loaderData ? `/year-in-deadlock/${loaderData.accountId}` : "/year-in-deadlock",
    });
    // Behind the same gate as the tracker: a crawler would index the gate under the name.
    return { ...base, meta: [...base.meta, { name: "robots", content: "noindex, follow" }] };
  },
});

function YearRecapRoute() {
  const { accountId, year, open } = Route.useLoaderData();
  return (
    <PatronAuthProvider>
      <TrackerGate accountId={accountId}>
        <YearRecapPage accountId={accountId} year={year} open={open} />
      </TrackerGate>
    </PatronAuthProvider>
  );
}
