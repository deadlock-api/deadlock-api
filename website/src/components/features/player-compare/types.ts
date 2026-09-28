import type { PlayerAggregate } from "~/lib/player-compare";

/** One column of a comparison. */
export interface ComparedPlayer {
  accountId: number;
  name: string;
  profileLoading: boolean;
  /** The player's series color, the same in every section. */
  color: string;
  /** Stats on the filters: null without matches, undefined while they load. */
  aggregate: PlayerAggregate | null | undefined;
}
