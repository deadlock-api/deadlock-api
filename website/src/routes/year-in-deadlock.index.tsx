import { createFileRoute, notFound } from "@tanstack/react-router";

import { YearRecapIndex } from "~/components/features/year-recap/YearRecapIndex";
import { IS_DEV } from "~/lib/constants";
import { pageTitle, seo } from "~/lib/seo";
import { isRecapOpen, recapYear } from "~/lib/year-recap/availability";

export const Route = createFileRoute("/year-in-deadlock/")({
  component: YearRecapIndexRoute,
  // The clock is read here, not in render: the server's answer reaches the client with the loader data, so hydration
  // renders the same page.
  loader: () => {
    const now = new Date();
    // Outside its window (1 December to 15 January) the recap does not exist: a 404, not an "opens soon" page.
    if (!IS_DEV && !isRecapOpen(now)) throw notFound();
    return { year: recapYear(now), open: true };
  },
  head: ({ loaderData }) =>
    seo({
      title: pageTitle(`Year in Deadlock ${loaderData?.year ?? ""}`.trim()),
      description:
        "Your Deadlock year in review: hours played, heroes, ranked journey, best games, play style, rivals and friends.",
      path: "/year-in-deadlock",
    }),
});

function YearRecapIndexRoute() {
  return <YearRecapIndex {...Route.useLoaderData()} />;
}
