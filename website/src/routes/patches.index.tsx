import { createFileRoute } from "@tanstack/react-router";

import { PatchPage } from "~/components/features/patches/PatchPage";
import { loadPatchView, patchHead } from "~/pages/patches/patch-view";

/** The newest patch, at the section's own address. */
export const Route = createFileRoute("/patches/")({
  component: LatestPatchRoute,
  loader: ({ context: { queryClient } }) => loadPatchView(queryClient),
  head: ({ loaderData }) => (loaderData ? patchHead(loaderData, "Deadlock Patch Changes: Win Rates by Patch") : {}),
});

function LatestPatchRoute() {
  return <PatchPage {...Route.useLoaderData()} />;
}
