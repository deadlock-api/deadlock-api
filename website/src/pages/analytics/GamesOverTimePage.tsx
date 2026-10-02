import GamesOverTimeChart from "~/components/features/games/GamesOverTimeChart";

import { Games } from "./GamesPage";

/** The over time route's page: its view in the route's own chunk, so the server renders it rather than its loading state. */
export function GamesOverTimePage() {
  return <Games OverTime={GamesOverTimeChart} />;
}
