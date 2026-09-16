import { createFileRoute } from "@tanstack/react-router";

import { redirectLegacyPage } from "~/lib/site-route-migration";

export const Route = createFileRoute("/deadlockdle/item-stats")({ beforeLoad: redirectLegacyPage });
