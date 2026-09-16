import { createFileRoute } from "@tanstack/react-router";

import { redirectLegacyPage } from "~/lib/site-route-migration";

export const Route = createFileRoute("/badge-distribution")({
  beforeLoad: redirectLegacyPage,
});
