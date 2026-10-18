import type { Match, MatchHero } from "~/hooks/streamkit/useMatchHistory";
import type { Theme } from "~/types/streamkit/widget";

export interface MatchItemProps {
  match: Match;
  hero: MatchHero;
  theme: Theme;
}
