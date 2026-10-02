import { createFileRoute } from "@tanstack/react-router";

import { statsMetricsPageOptions } from "~/pages/analytics/PlayersPageOptions";

export const Route = createFileRoute("/analytics/players/stats-metrics")({ ...statsMetricsPageOptions });
