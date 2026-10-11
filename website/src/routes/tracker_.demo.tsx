import { createFileRoute } from "@tanstack/react-router";

import { DemoNotice } from "~/components/features/tracker/shared/DemoNotice";
import { TrackerContent } from "~/components/features/tracker/TrackerContent";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PatronAuthProvider } from "~/contexts/PatronAuthContext";
import type { DateRange } from "~/lib/date-filter-preference";
import { prefetchCached } from "~/lib/prefetch-safe";
import { pageTitle, seo } from "~/lib/seo";
import { DEMO_ACCOUNT_ID } from "~/lib/tracker/demo";
import { heroesQueryOptions } from "~/queries/asset-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";
import { steamProfileQueryOptions } from "~/queries/steam-queries";
import { trackerMatchHistoryQueryOptions, trackerRankQueryOptions } from "~/queries/tracker-queries";

export const Route = createFileRoute("/tracker_/demo")({
  component: TrackerDemoRoute,
  // The whole overview is prefetched so the server-rendered page carries the tracker itself, not a skeleton.
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      prefetchCached(queryClient, trackerMatchHistoryQueryOptions(DEMO_ACCOUNT_ID)),
      prefetchCached(queryClient, trackerRankQueryOptions(DEMO_ACCOUNT_ID)),
      prefetchCached(queryClient, steamProfileQueryOptions(DEMO_ACCOUNT_ID)),
      prefetchCached(queryClient, heroesQueryOptions),
      prefetchCached(queryClient, ranksQueryOptions),
    ]);
    return { breadcrumb: "Player Tracker" };
  },
  head: () =>
    seo({
      title: pageTitle("Deadlock Tracker: Match History & Rank"),
      description:
        "Free Deadlock match history, rank progression and hero stats for your Steam account. Try the tracker on a demo profile, then unlock your own.",
      path: "/tracker/demo",
    }),
});

// The generated season is the whole point of the page, so a first visit shows all of it, not just the current patch.
const ALL_TIME: DateRange = [undefined, undefined];

function TrackerDemoRoute() {
  return (
    <PatronAuthProvider>
      <TrackerContent
        accountId={DEMO_ACCOUNT_ID}
        notice={
          <>
            {/* The page is the tracker's own, so it is named for the tracker; the made-up player is a heading below. */}
            <PageHeader title="Deadlock Player Tracker" align="start" />
            <DemoNotice />
          </>
        }
        playerHeading="h2"
        defaultDateRange={ALL_TIME}
      />
    </PatronAuthProvider>
  );
}
