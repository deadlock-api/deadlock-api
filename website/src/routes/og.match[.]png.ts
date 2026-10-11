import { createFileRoute } from "@tanstack/react-router";

import { MATCH_CARD_VERSION } from "~/lib/og/card-kit";
import { serveCachedCard } from "~/lib/og/edge-cache";

/** The share card of a match, `/og/match.png?id=…`: the match page's og:image. */
export const Route = createFileRoute("/og/match.png")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const params = new URLSearchParams();
        const id = url.searchParams.get("id");
        if (id && /^\d+$/.test(id)) params.set("id", String(Number(id)));
        // Cards of an older design are not answered from the cache.
        params.set("v", MATCH_CARD_VERSION);
        return serveCachedCard(url, params, async (cardParams) => {
          const { renderMatchCard } = await import("~/lib/og/render-match-card");
          return renderMatchCard(cardParams);
        });
      },
    },
  },
});
