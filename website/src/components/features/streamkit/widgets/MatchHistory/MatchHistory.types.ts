import type { MatchEntry } from "~/hooks/streamkit/useMatchHistory";
import type { Theme } from "~/types/streamkit/widget";

export interface Hero {
  id: number;
  images: {
    icon_hero_card_webp: string;
  };
}

export interface MatchHistoryProps {
  theme: Theme;
  /** The matches to show, newest first (`useMatchHistory`). */
  entries: MatchEntry[];
  /** The matches, or how many to show, are not known yet: the strip keeps its place. */
  pending?: boolean;
  opacity?: number;
}
