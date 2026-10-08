import { createFileRoute } from "@tanstack/react-router";

import { CROSSHAIR_CARD_VERSION } from "~/lib/og/card-kit";
import { serveCachedCard } from "~/lib/og/edge-cache";

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
        // Cards of an older design are not answered from the cache.
        params.set("v", CROSSHAIR_CARD_VERSION);
        return serveCachedCard(url, params, async (cardParams) => {
          const { renderCrosshairCard } = await import("~/lib/og/render-crosshair-card");
          return renderCrosshairCard(cardParams);
        });
      },
    },
  },
});
