import { sortParam } from "../readers";
import type { RegisteredPage } from "../types";

const ALL = ["mode", "rank", "time"] as const;

export const GAME_PAGES: RegisteredPage[] = [
  {
    id: "games_overview",
    description: "overall match stats: Hidden King vs Archmother side win rates, average match length, objectives",
    context: "Hidden King and Archmother are the two team sides, not heroes.",
    path: "/analytics/games",
    filters: ALL,
  },
  {
    id: "games_over_time",
    description: "how average match stats changed day by day: match duration, kills, souls, damage per game",
    path: "/analytics/games/over-time",
    search: {
      stat: sortParam({
        kills: "avg_kills",
        deaths: "avg_deaths",
        assists: "avg_assists",
        souls: "avg_net_worth",
        damage: "avg_player_damage",
        healing: "avg_player_healing",
        last_hits: "avg_last_hits",
        denies: "avg_denies",
        boss_damage: "avg_boss_damage",
        creep_damage: "avg_creep_damage",
        neutral_damage: "avg_neutral_damage",
        creep_kills: "avg_creep_kills",
        neutral_kills: "avg_neutral_kills",
        max_health: "avg_max_health",
        level: "avg_ending_level",
        permanent_buffs: "avg_permanent_buffs",
        accuracy: "avg_accuracy",
        duration: "avg_duration_s",
      }),
    },
    filters: ALL,
  },
  {
    id: "games_by_rank",
    description: "how matches differ between ranks: length, kills and souls in low versus high elo",
    context:
      "Only for comparing ranks with each other; game stats of one rank range are games_overview with that rank.",
    path: "/analytics/games/by-rank",
    filters: ["mode", "time"],
  },
  {
    id: "games_economy",
    description:
      "where souls come from: troopers, neutral camps, player kills and orbs; farm and soul income per minute",
    context:
      "Troopers are the lane creeps (minions) and souls are the gold. Questions about farming, troopers, creeps, " +
      "last hits as income, or the economy belong here.",
    path: "/analytics/games/economy",
    filters: ALL,
  },
  {
    id: "games_combat",
    description: "fighting across all matches: damage, healing, accuracy, crits, kills and deaths per game",
    path: "/analytics/games/combat",
    filters: ALL,
  },
  {
    id: "games_buffs",
    description: "golden statue buffs: how many players pick up each stat buff per match, at which level and when",
    path: "/analytics/games/buffs",
    filters: ALL,
  },
];
