import EconomyTab from "~/components/features/games/EconomyTab";

import { Games } from "./GamesPage";

/** The economy route's page: its view in the route's own chunk, so the server renders it rather than its loading state. */
export function GamesEconomyPage() {
  return <Games Economy={EconomyTab} />;
}
