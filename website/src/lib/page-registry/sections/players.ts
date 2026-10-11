import { findStat, heroId, region, sortParam, teamSlots } from "../readers";
import { SCOREBOARD_STAT_NAMES, scoreboardSort } from "../scoreboards";
import type { RegisteredPage } from "../types";

const ALL = ["mode", "rank", "time"] as const;

export const PLAYER_PAGES: RegisteredPage[] = [
  {
    id: "player_scoreboard",
    title: "Player Scoreboard",
    description:
      "players ranked by their totals, optionally on one hero: the best players of a hero, who has the most of any " +
      `stat: wins, ${SCOREBOARD_STAT_NAMES}`,
    path: "/analytics/players",
    search: { hero: heroId(), sort_by: sortParam(scoreboardSort("total")) },
    filters: ALL,
    find: findStat(scoreboardSort("total")),
  },
  {
    id: "player_stats",
    title: "Player Stats",
    description: "how player stats are spread: what a good kda, souls per minute or accuracy is, percentiles",
    path: "/analytics/players/stats-metrics",
    filters: ALL,
  },
  {
    id: "player_compare",
    title: "Compare Players",
    description: "put two or more players next to each other and see who wins which stat",
    path: "/analytics/players/compare",
  },
  {
    id: "team_builder",
    title: "Team Builder",
    description: "draft two teams of heroes and predict which wins: my team against an enemy team",
    context: "Two teams of heroes against each other, for a draft.",
    path: "/analytics/team-builder",
    search: { ally: teamSlots("heroes"), enemy: teamSlots("enemyHeroes") },
    filters: ALL,
  },
  {
    id: "leaderboard",
    title: "Leaderboard",
    description: "the ranked leaderboard of top players by region, optionally on one hero",
    path: "/community/leaderboard",
    search: { region: region(), hero_id: heroId() },
  },
];
