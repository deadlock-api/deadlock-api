import { MaskedIcon } from "~/components/ui/masked-icon";
import type { Side } from "~/lib/team-builder/analysis";
import { TEAM_NAMES } from "~/lib/team-builder/lanes";

/** Team1 is the Hidden King's side, Team2 the Archmother's, matching `Team0`/`Team1` in match data. */
const TEAM_ICON: Record<Side, string> = {
  ally: "https://assets-bucket.deadlock-api.com/assets-api-res/images/hud/core/icon_team1.webp",
  enemy: "https://assets-bucket.deadlock-api.com/assets-api-res/images/hud/core/icon_team2.webp",
};

/**
 * Drawn as a mask rather than an `img`: the two source files are flat white and flat black on
 * transparency, so one of them disappears against any background we have. Only their alpha is used,
 * which paints the emblem in the surrounding text colour.
 */
export function TeamEmblem({ side, className }: { side: Side; className?: string }) {
  return <MaskedIcon src={TEAM_ICON[side]} title={TEAM_NAMES[side]} className={className} />;
}
