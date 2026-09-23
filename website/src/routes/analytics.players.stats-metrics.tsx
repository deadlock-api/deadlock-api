import { createFileRoute } from "@tanstack/react-router";

import { playersPageOptions } from "~/pages/analytics/PlayersPageOptions";

// This tab never shows the scoreboard, so it skips the loader that warms it (1000 rows and their Steam profiles, which
// the page waited for).
const { loader: _scoreboardLoader, loaderDeps: _scoreboardDeps, ...statsMetricsOptions } = playersPageOptions;

export const Route = createFileRoute("/analytics/players/stats-metrics")({ ...statsMetricsOptions });
