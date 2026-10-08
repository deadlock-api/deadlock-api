import { createFileRoute } from "@tanstack/react-router";

import { NotFound } from "~/components/app/NotFound";
import { PatchPage } from "~/components/features/patches/PatchPage";
import { loadPatchView, patchHead } from "~/pages/patches/patch-view";

export const Route = createFileRoute("/patches/$patchId")({
  component: PatchRoute,
  loader: ({ context: { queryClient }, params }) => loadPatchView(queryClient, params.patchId),
  notFoundComponent: () => <NotFound />,
  head: ({ loaderData }) => (loaderData ? patchHead(loaderData) : {}),
});

function PatchRoute() {
  return <PatchPage {...Route.useLoaderData()} />;
}
