import type { Theme } from "~/types/streamkit/widget";

export interface Hero {
  id: number;
  images: {
    icon_hero_card_webp: string;
  };
}

export interface MatchHistoryProps {
  theme: Theme;
  numMatches?: number;
  accountId: string;
  /** The number of matches is not known yet (today's count still loading): the strip keeps its place. */
  pending?: boolean;
  opacity?: number;
}
