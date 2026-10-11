/** Match metadata uses Team0/Team1; history rows use the corresponding array index. */
export const TEAMS = [
  { key: "Team0", name: "The Hidden King" },
  { key: "Team1", name: "The Archmother" },
] as const;

/**
 * How a match view names its two sides: from a tracked player's team ("Your team"), or neutrally from the Hidden
 * King's side for a match seen on its own.
 */
export interface MatchSides {
  neutral: boolean;
  own: string;
  enemy: string;
}

export const PLAYER_SIDES: MatchSides = { neutral: false, own: "Your team", enemy: "Enemy team" };
export const NEUTRAL_SIDES: MatchSides = { neutral: true, own: TEAMS[0].name, enemy: TEAMS[1].name };
