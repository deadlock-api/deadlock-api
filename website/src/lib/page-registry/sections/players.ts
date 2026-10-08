import { heroId, region, sortParam, teamSlots } from "../readers";
import type { RegisteredPage } from "../types";
import { SCOREBOARD_SORT } from "./heroes";

const ALL = ["mode", "rank", "time"] as const;

export const PLAYER_PAGES: RegisteredPage[] = [
  {
    id: "player_scoreboard",
    description:
      "the players with the most kills, wins, damage or souls, optionally on one hero; best players of a hero",
    path: "/analytics/players",
    search: { hero: heroId(), sort_by: sortParam({ ...SCOREBOARD_SORT, kda: "kills" }) },
    filters: ALL,
  },
  {
    id: "player_stats",
    description: "how player stats are spread: what a good kda, souls per minute or accuracy is, percentiles",
    path: "/analytics/players/stats-metrics",
    filters: ALL,
  },
  {
    id: "player_compare",
    description: "put two or more players next to each other and see who wins which stat",
    path: "/analytics/players/compare",
  },
  {
    id: "player_tracker",
    description: "your own match history, heroes, rank and teammates: my stats, my matches, my profile",
    path: "/tracker",
  },
  {
    id: "team_builder",
    description: "draft two teams of heroes and predict which wins: my team against an enemy team",
    context: "Two teams of heroes against each other, for a draft.",
    path: "/analytics/team-builder",
    search: { ally: teamSlots("heroes"), enemy: teamSlots("enemyHeroes") },
    filters: ALL,
  },
  {
    id: "leaderboard",
    description: "the ranked leaderboard of top players by region, optionally on one hero",
    path: "/community/leaderboard",
    search: { region: region(), hero_id: heroId() },
  },
];
