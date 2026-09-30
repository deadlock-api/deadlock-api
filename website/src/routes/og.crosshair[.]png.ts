import { createFileRoute } from "@tanstack/react-router";

/** The share card of a crosshair, `/og/crosshair.png?code=…&res=…`: the crosshair editor's og:image. */
export const Route = createFileRoute("/og/crosshair.png")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const params = new URLSearchParams();
        for (const name of ["code", "res"]) {
          const value = url.searchParams.get(name);
          if (value) params.set(name, value);
        }
        // The Workers edge cache, keyed by the card's canonical URL; absent in the Vite dev server.
        const key = new Request(`${url.origin}${url.pathname}${params.size > 0 ? `?${params}` : ""}`);
        const edge = typeof caches === "undefined" ? undefined : (caches as unknown as { default?: Cache }).default;
        const cached = await edge?.match(key);
        if (cached) return cached;
        const { renderCrosshairCard } = await import("~/lib/og/render-crosshair-card");
        const response = await renderCrosshairCard(params);
        if (edge && response.ok) await edge.put(key, response.clone());
        return response;
      },
    },
  },
});
