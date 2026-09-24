import { createFileRoute } from "@tanstack/react-router";

import { DemoNotice } from "~/components/features/tracker/shared/DemoNotice";
import { TrackerContent } from "~/components/features/tracker/TrackerContent";
import { PatronAuthProvider } from "~/contexts/PatronAuthContext";
import type { DateRange } from "~/lib/date-filter-preference";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { pageTitle, seo } from "~/lib/seo";
import { DEMO_ACCOUNT_ID } from "~/lib/tracker/demo";
import { heroesQueryOptions } from "~/queries/asset-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";
import {
  steamProfileQueryOptions,
  trackerMatchHistoryQueryOptions,
  trackerRankQueryOptions,
} from "~/queries/tracker-queries";

export const Route = createFileRoute("/tracker_/demo")({
  component: TrackerDemoRoute,
  // The whole overview is prefetched so the server-rendered page carries the tracker itself, not a skeleton.
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      prefetchSafe(queryClient.ensureQueryData(trackerMatchHistoryQueryOptions(DEMO_ACCOUNT_ID))),
      prefetchSafe(queryClient.ensureQueryData(trackerRankQueryOptions(DEMO_ACCOUNT_ID))),
      prefetchSafe(queryClient.ensureQueryData(steamProfileQueryOptions(DEMO_ACCOUNT_ID))),
      prefetchSafe(queryClient.ensureQueryData(heroesQueryOptions)),
      prefetchSafe(queryClient.ensureQueryData(ranksQueryOptions)),
    ]);
    return { breadcrumb: "Demo profile" };
  },
  head: () =>
    seo({
      title: pageTitle("Deadlock Player Tracker Demo"),
      description:
        "Try the Deadlock player tracker on a sample profile: match history, rank progression, hero breakdowns, performance trends, and teammate & opponent analytics.",
      path: "/tracker/demo",
    }),
});

// The generated season is the whole point of the page, so a first visit shows all of it, not just the current patch.
const ALL_TIME: DateRange = [undefined, undefined];

function TrackerDemoRoute() {
  return (
    <PatronAuthProvider>
      <TrackerContent accountId={DEMO_ACCOUNT_ID} notice={<DemoNotice />} defaultDateRange={ALL_TIME} />
    </PatronAuthProvider>
  );
}
