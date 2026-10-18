import type { Match } from "~/hooks/streamkit/useMatchHistory";
import type { Theme } from "~/types/streamkit/widget";

export interface MatchItemProps {
  match: Match;
  heroImage: string;
  theme: Theme;
}
