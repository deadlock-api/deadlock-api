import BuffsTab from "~/components/features/games/BuffsTab";

import { Games } from "./GamesPage";

/** The buffs route's page: its view in the route's own chunk, so the server renders it rather than its loading state. */
export function GamesBuffsPage() {
  return <Games Buffs={BuffsTab} />;
}
