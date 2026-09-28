import { createFileRoute } from "@tanstack/react-router";

import { canonicalCardParams } from "~/lib/compare-share";

/** The share card of a comparison, `/og/compare.png?players=…` with the page's filters: its og:image and download. */
export const Route = createFileRoute("/og/compare.png")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const params = canonicalCardParams(url.searchParams);
        // The Workers edge cache, keyed by the card's canonical URL; absent in the Vite dev server.
        const key = new Request(`${url.origin}${url.pathname}${params.size > 0 ? `?${params}` : ""}`);
        const edge = typeof caches === "undefined" ? undefined : (caches as unknown as { default?: Cache }).default;
        const cached = await edge?.match(key);
        if (cached) return cached;
        const { renderCompareCard } = await import("~/lib/og/render-compare-card");
        const response = await renderCompareCard(params);
        if (edge && response.ok) await edge.put(key, response.clone());
        return response;
      },
    },
  },
});
