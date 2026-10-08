import { comboSize, heroId, heroIds, heroSlugParam, sortParam } from "../readers";
import { SCOREBOARD_STAT_NAMES, scoreboardSort } from "../scoreboards";
import type { RegisteredPage } from "../types";

const ALL = ["mode", "rank", "time"] as const;

export const HERO_PAGES: RegisteredPage[] = [
  {
    id: "hero_stats",
    description: "win rate, pick rate and ban rate of every hero in one table; best, worst or most played heroes",
    path: "/analytics/heroes",
    search: { hero_sort_key: sortParam({ winrate: "winrate", pickrate: "pickRate", banrate: "banRate" }) },
    filters: ALL,
  },
  {
    id: "tier_list",
    description: "every hero ranked S to D; the meta, which heroes are strong, op or broken right now",
    path: "/analytics/heroes/tier-list",
    search: {
      tier_metric: sortParam({
        winrate: "winRate",
        pickrate: "pickRate",
        banrate: "banRate",
        kills: "kills",
        deaths: "deaths",
        kda: "kda",
        damage: "heroDamage",
        souls: "souls",
        last_hits: "lastHits",
      }),
    },
    filters: ALL,
  },
  {
    id: "hero_page",
    description: "one hero's own page: how good it is, its win rate, best items, matchups and abilities at a glance",
    context: 'Pick it for a question about one hero that names no specific stat, such as "is haze good".',
    path: "/analytics/heroes/$heroName",
    pathParams: { heroName: heroSlugParam() },
    fallbackPath: "/analytics/heroes",
  },
  {
    id: "hero_counters",
    description: "one hero against every other hero: its counters, who it beats, who it loses to",
    context:
      'A question naming one hero\'s counters, or one hero against another ("haze vs bebop"), is this page, unless it ' +
      "asks what to buy or build: that is item_stats. It also lists the hero's best teammates, so it is a good second " +
      "pick for a teammate question.",
    path: "/analytics/heroes/matchup-details",
    search: { hero_id: heroId() },
    filters: ALL,
  },
  {
    id: "hero_matchups",
    description: "the matchup table of all heroes at once: the best and worst opponent and teammate of every hero",
    path: "/analytics/heroes/matchups",
    filters: ALL,
  },
  {
    id: "hero_synergy",
    description:
      "hero duos and trios on the same team and how often they win together: who to pair a hero with, good teammates, synergy",
    context: "Only for heroes playing together. A question about the trooper or soul economy is games_economy.",
    path: "/analytics/heroes/combos",
    search: { comb_include_heroes: heroIds(), comb_size: comboSize(2, 6) },
    filters: ALL,
  },
  {
    id: "heroes_over_time",
    description: "how heroes' win rate or pick rate changed day by day; trends, nerfs and buffs",
    path: "/analytics/heroes/over-time",
    search: {
      trend_heroes: heroIds(),
      hero_stat: sortParam({
        winrate: "winrate",
        pickrate: "matches",
        matches: "matches",
        banrate: "ban_rate",
        kills: "kills_per_match",
        deaths: "deaths_per_match",
        assists: "assists_per_match",
        souls: "net_worth_per_match",
        last_hits: "last_hits_per_match",
      }),
    },
    filters: ALL,
  },
  {
    id: "heroes_by_rank",
    description: "hero win and pick rates compared across ranks: which heroes are stronger in low elo than in high elo",
    context:
      'Only for comparing ranks with each other. A question about one rank range ("best heroes in eternus") is ' +
      "tier_list or hero_stats with that rank.",
    path: "/analytics/heroes/by-rank",
    filters: ["mode", "time"],
  },
  {
    id: "heroes_by_duration",
    description: "hero win rates in short and long games: early-game and late-game heroes, who scales",
    path: "/analytics/heroes/by-duration",
    filters: ALL,
  },
  {
    id: "heroes_by_experience",
    description: "hero win rates by how many games players have on the hero: which heroes are hard to learn",
    path: "/analytics/heroes/by-experience",
    filters: ALL,
  },
  {
    id: "hero_scoreboard",
    description: `every hero's average per match, heroes ranked by any stat: ${SCOREBOARD_STAT_NAMES}`,
    context:
      'Heroes only, never players: a question about players or people ("players with the most kills", "who has ' +
      'the most denies") is player_scoreboard. Which hero is best overall is tier_list.',
    path: "/analytics/heroes/scoreboard",
    search: { scoreboard_sort_by: sortParam(scoreboardSort("avg")) },
    filters: ALL,
  },
];
