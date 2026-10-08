import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";

import { PatchNav } from "~/components/features/patches/PatchNav";
import { ListDetail, ListDetailMain } from "~/components/patterns/list-detail/ListDetail";
import { PageShell } from "~/components/patterns/page/PageShell";
import { loadPatchList } from "~/pages/patches/patch-view";

/** Every patch in a list beside the one shown, like a match history. */
export const Route = createFileRoute("/patches")({
  component: PatchesLayout,
  loader: async ({ context: { queryClient } }) => ({ patches: await loadPatchList(queryClient) }),
});

function PatchesLayout() {
  const { patches } = Route.useLoaderData();
  const { patchId } = useParams({ strict: false });
  return (
    <PageShell>
      <ListDetail>
        <ListDetailMain>
          <Outlet />
        </ListDetailMain>
        <PatchNav patches={patches} currentId={patchId ?? patches[0]?.id} />
      </ListDetail>
    </PageShell>
  );
}
