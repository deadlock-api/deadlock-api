import { createFileRoute } from "@tanstack/react-router";

/** The share card of a comparison, `/og/compare.png?players=…` with the page's filters: its og:image and download. */
export const Route = createFileRoute("/og/compare.png")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        // The Workers edge cache, keyed by the full URL; absent in the Vite dev server.
        const edge = typeof caches === "undefined" ? undefined : (caches as unknown as { default?: Cache }).default;
        const cached = await edge?.match(request);
        if (cached) return cached;
        const { renderCompareCard } = await import("~/lib/og/render-compare-card");
        const response = await renderCompareCard(url.searchParams);
        if (edge && response.ok) await edge.put(request, response.clone());
        return response;
      },
    },
  },
});
