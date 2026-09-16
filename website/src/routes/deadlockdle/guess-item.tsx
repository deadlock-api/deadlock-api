import { createFileRoute } from "@tanstack/react-router";

import { redirectLegacyPage } from "~/lib/site-route-migration";

export const Route = createFileRoute("/deadlockdle/guess-item")({ beforeLoad: redirectLegacyPage });
