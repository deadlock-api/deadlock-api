import { createFileRoute } from "@tanstack/react-router";

import { canonicalCardParams } from "~/lib/compare-share";
import { serveCachedCard } from "~/lib/og/edge-cache";

/** The share card of a comparison, `/og/compare.png?players=…` with the page's filters: its og:image and download. */
export const Route = createFileRoute("/og/compare.png")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const params = canonicalCardParams(url.searchParams);
        return serveCachedCard(url, params, async (cardParams) => {
          const { renderCompareCard } = await import("~/lib/og/render-compare-card");
          return renderCompareCard(cardParams);
        });
      },
    },
  },
});
