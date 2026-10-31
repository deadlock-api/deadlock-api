import { createFileRoute, notFound } from "@tanstack/react-router";
import { Suspense } from "react";

import { findLabVariant } from "~/components/dev/lab/registry";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { findItemBySlug } from "~/lib/item-slug";
import { ensureCached } from "~/lib/prefetch-safe";
import { filterShopableItems, itemUpgradesQueryOptions } from "~/queries/asset-queries";

export const Route = createFileRoute("/dev/lab/$variant/items/$itemName")({
  loader: async ({ context: { queryClient }, params }) => {
    if (!import.meta.env.DEV || !findLabVariant(params.variant)) throw notFound();
    const items = await ensureCached(queryClient, itemUpgradesQueryOptions);
    const item = findItemBySlug(filterShopableItems(items), params.itemName);
    if (!item) throw notFound();
    return { itemId: item.id, itemName: item.name, variant: params.variant };
  },
  head: () => ({ meta: [{ title: "Lab: item" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: LabItemRoute,
});

function LabItemRoute() {
  const { itemId, itemName, variant } = Route.useLoaderData();
  const ItemPage = findLabVariant(variant)?.ItemPage;
  if (!ItemPage) return null;
  return (
    <Suspense fallback={<LoadingState label="design" />}>
      <ItemPage key={itemId} itemId={itemId} itemName={itemName} variant={variant} />
    </Suspense>
  );
}
