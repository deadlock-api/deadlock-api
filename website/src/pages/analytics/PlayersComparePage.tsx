import { PlayerComparison } from "~/components/features/player-compare/PlayerComparison";

import { PlayersPage } from "./PlayersPage";

/**
 * The compare route's page: the players page with the comparison in its own chunk rather than lazy inside it, so the
 * route loads it before hydrating and the server's panels stay on screen.
 */
export function PlayersComparePage() {
  return <PlayersPage Comparison={PlayerComparison} />;
}
