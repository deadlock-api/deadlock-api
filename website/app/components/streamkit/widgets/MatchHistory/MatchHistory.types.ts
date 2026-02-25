import type { Theme } from "~/types/streamkit/widget";

export interface Match {
  match_id: number;
  hero_id: number;
  match_result: number;
  player_team: number;
}

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
  refresh?: number;
  opacity?: number;
}

export interface UseMatchHistoryResult {
  matches: Match[];
  heroes: Map<number, string>;
  loading: boolean;
}
