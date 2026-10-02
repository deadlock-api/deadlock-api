import GamesByRankChart from "~/components/features/games/GamesByRankChart";

import { Games } from "./GamesPage";

/** The by rank route's page: its view in the route's own chunk, so the server renders it rather than its loading state. */
export function GamesByRankPage() {
  return <Games ByRank={GamesByRankChart} />;
}
