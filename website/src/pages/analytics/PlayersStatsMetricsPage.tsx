import { PlayerStatsDistributionCharts } from "~/components/features/players/PlayerStatsDistributionCharts";

import { PlayersPage } from "./PlayersPage";

/**
 * The stats metrics route's page: the distributions in the route's own chunk, so the server renders them rather than
 * their loading state.
 */
export function PlayersStatsMetricsPage() {
  return <PlayersPage Distributions={PlayerStatsDistributionCharts} />;
}
