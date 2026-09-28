import { createFileRoute } from "@tanstack/react-router";

import { redirectLegacyHeroId, redirectLegacyPage } from "~/lib/site-route-migration";

export const Route = createFileRoute("/heroes")({
  beforeLoad: async (options) => {
    await redirectLegacyHeroId(options);
    redirectLegacyPage(options);
  },
});
