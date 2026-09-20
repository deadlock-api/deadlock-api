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

  opacity?: number;
}
