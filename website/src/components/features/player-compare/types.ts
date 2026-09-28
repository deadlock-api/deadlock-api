import type { PlayerAggregate } from "~/lib/player-compare";

/** One column of a comparison. */
export interface ComparedPlayer {
  accountId: number;
  name: string;
  /** The Steam avatar, large enough for a card portrait; undefined until the profile loads. */
  avatar?: string;
  profileLoading: boolean;
  /** The player's series color, the same in every section. */
  color: string;
  /** What the player's percentiles say they are good at: "Farmer", "Support"; undefined until known. */
  playstyle?: string;
  /** Stats on the filters: null without matches, undefined while they load. */
  aggregate: PlayerAggregate | null | undefined;
}
