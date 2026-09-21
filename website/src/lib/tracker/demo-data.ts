import type {
  EnemyStats,
  HashMapValue,
  HeroStats,
  MateStats,
  PlayerMatchHistoryEntry,
  RankResponse,
  SteamProfile,
} from "deadlock_api_client";

import type { SlimHero, SlimUpgrade } from "~/queries/asset-queries";
import type {
  TrackerAbility,
  TrackerMatchItem,
  TrackerMatchMetadata,
  TrackerMatchPlayer,
  TrackerMatchStat,
  TrackerObjective,
  TrackerObjectiveKind,
  TrackerPlayerDeaths,
} from "~/queries/tracker-queries";

import { combatStats } from "./combat-stats";
import { DEMO_ACCOUNT_ID, demoMatchId, demoMatchIndex } from "./demo";
import { TEAMS } from "./teams";

const GAME_MODE_NORMAL = 1;
const GAME_MODE_STREET_BRAWL = 4;
const MATCH_MODE_UNRANKED = 1;
const MATCH_MODE_RANKED = 4;
const LANE_IDS = [1, 4, 6];

const HISTORY_DAYS = 180;
const DAY_S = 86_400;
const HERO_POOL_WEIGHTS = [30, 22, 16, 12, 8, 6, 4, 2];
/** Win-rate shift per hero in the pool, so the hero breakdowns have strong and weak picks to show. */
const HERO_POOL_SKILL = [0.02, 0.09, -0.06, 0.13, -0.1, 0.05, -0.02, 0.16];
const POINTS_PER_SUBTIER = 250;
/** Tier 6, subtier 2; the generated season climbs from here. */
const START_BADGE = 62;

const PLAYER_NAME = "Demo Player";
const COMPANION_NAMES = [
  "quietlantern",
  "Mossback",
  "velvet_anvil",
  "Nightjar",
  "papercrane",
  "OldSaltMarlow",
  "tin_whistle",
  "Brackenfell",
  "halfmoonhex",
  "Copperpot",
  "sablewick",
  "Third Rail Theo",
  "glasshouse",
  "Wrenfield",
  "ember_and_ash",
  "Dovetail",
  "lowtide",
  "Marrowby",
  "static_bloom",
  "Pennywhistle Pete",
  "ashgrove",
  "Foxglove",
  "cold_brew_cass",
  "Hollowreed",
  "sundial",
  "Kettleblack",
  "thimble",
  "Oakum",
  "winter_wren",
  "Larkspur",
  "gravelvoice",
  "Juniper Vance",
  "saltmarsh",
  "Bellweather",
  "two_left_boots",
  "Cinderwick",
  "driftglass",
  "Harrowgate",
  "plumline",
  "Rookery",
];
/** The demo player's regular party, and how often each one queues with them. */
const REGULAR_MATES = [
  { offset: 1, rate: 0.45 },
  { offset: 2, rate: 0.3 },
  { offset: 3, rate: 0.15 },
];

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const between = (rng: Rng, min: number, max: number) => min + rng() * (max - min);
const intBetween = (rng: Rng, min: number, max: number) => Math.floor(between(rng, min, max + 1));

function pick<T>(rng: Rng, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)];
}

function shuffled<T>(rng: Rng, values: readonly T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function weightedIndex(rng: Rng, weights: readonly number[]): number {
  let roll = rng() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll < 0) return i;
  }
  return weights.length - 1;
}

function badgeAfter(points: number): number {
  const linear = (Math.floor(START_BADGE / 10) - 1) * 6 + (START_BADGE % 10) + Math.floor(points / POINTS_PER_SUBTIER);
  return (Math.floor((linear - 1) / 6) + 1) * 10 + ((linear - 1) % 6) + 1;
}

/**
 * The demo player's match history, newest first. It ends yesterday relative to `nowS`, so the profile always looks
 * recently played, and it is otherwise a pure function of the hero list.
 */
export function demoMatchHistory(heroIds: readonly number[], nowS: number): PlayerMatchHistoryEntry[] {
  const rng = mulberry32(0xbeef);
  // Its own generator, so a newly released hero reshuffles the pool without rerolling every match.
  const pool = shuffled(
    mulberry32(0x9e0),
    heroIds.toSorted((a, b) => a - b),
  ).slice(0, HERO_POOL_WEIGHTS.length);
  const today = Math.floor(nowS / DAY_S) * DAY_S;
  const entries: PlayerMatchHistoryEntry[] = [];
  let rankPoints = 0;

  for (let daysAgo = HISTORY_DAYS; daysAgo >= 1; daysAgo--) {
    if (rng() > 0.85) continue;
    const dayStart = today - daysAgo * DAY_S;
    const weekend = [0, 6].includes(new Date(dayStart * 1000).getUTCDay());
    // Mostly evenings, with weekend afternoons, the odd morning and some late nights, so every part of the
    // play-habits grid has something in it.
    const hourRoll = rng();
    const startHour =
      hourRoll < 0.08
        ? intBetween(rng, 7, 10)
        : hourRoll < 0.2
          ? intBetween(rng, 22, 25)
          : weekend
            ? intBetween(rng, 11, 20)
            : intBetween(rng, 17, 21);
    let startTime = dayStart + startHour * 3600 + intBetween(rng, 0, 3599);
    const sessionLength = 1 + weightedIndex(rng, [1, 3, 4, 4, 3, 2]);
    for (let n = 0; n < sessionLength; n++) {
      const modeRoll = rng();
      const brawl = modeRoll > 0.9;
      const ranked = modeRoll < 0.65;
      const heroSlot = weightedIndex(rng, HERO_POOL_WEIGHTS.slice(0, pool.length));
      const hero = pool[heroSlot];
      // The player improves over the season, so trends and rank progression have a direction to show.
      const won = rng() < 0.47 + 0.1 * (1 - daysAgo / HISTORY_DAYS) + HERO_POOL_SKILL[heroSlot];
      const team = intBetween(rng, 0, 1);
      const durationS = brawl ? intBetween(rng, 480, 840) : Math.round(1200 + 1900 * rng() ** 1.4);
      const minutes = durationS / 60;
      const form = won ? 1.15 : 0.85;
      const rankedDelta = ranked ? (won ? intBetween(rng, 20, 32) : -intBetween(rng, 14, 22)) : null;
      const badge = ranked ? badgeAfter(rankPoints) : null;
      if (rankedDelta != null) rankPoints = Math.max(0, rankPoints + rankedDelta);

      entries.push({
        account_id: DEMO_ACCOUNT_ID,
        match_id: demoMatchId(entries.length),
        start_time: startTime,
        match_duration_s: durationS,
        game_mode: brawl ? GAME_MODE_STREET_BRAWL : GAME_MODE_NORMAL,
        match_mode: ranked ? MATCH_MODE_RANKED : MATCH_MODE_UNRANKED,
        hero_id: hero,
        hero_level: Math.min(36, Math.round(minutes * between(rng, 0.85, 1))),
        player_team: team,
        match_result: won ? team : 1 - team,
        player_match_outcome: 0,
        player_kills: Math.round(minutes * between(rng, 0.12, 0.34) * form),
        player_deaths: Math.round((minutes * between(rng, 0.1, 0.26)) / form),
        player_assists: Math.round(minutes * between(rng, 0.2, 0.45) * form),
        net_worth: Math.round(minutes * between(rng, 950, 1250) * form),
        last_hits: Math.round(minutes * between(rng, 4.5, 7)),
        denies: Math.round(minutes * between(rng, 0.2, 0.7)),
        objectives_mask_team0: 0,
        objectives_mask_team1: 0,
        ranked_delta: rankedDelta,
        ranked_display_badge: badge,
        brawl_score_team0: brawl ? (won === (team === 0) ? 3 : intBetween(rng, 0, 2)) : null,
        brawl_score_team1: brawl ? (won === (team === 1) ? 3 : intBetween(rng, 0, 2)) : null,
      });
      startTime += durationS + intBetween(rng, 240, 600);
    }
  }
  // A late session can run past midnight; nothing may end after the moment the page is looked at.
  return entries.filter((entry) => entry.start_time + entry.match_duration_s < nowS).reverse();
}

export function demoRank(history: readonly PlayerMatchHistoryEntry[]): RankResponse {
  const latest = history.find((entry) => entry.ranked_display_badge != null);
  const badge = latest?.ranked_display_badge ?? START_BADGE;
  return { badge, rank: Math.floor(badge / 10), subrank: badge % 10 };
}

function demoName(accountId: number): string {
  if (accountId === DEMO_ACCOUNT_ID) return PLAYER_NAME;
  return COMPANION_NAMES[(accountId - DEMO_ACCOUNT_ID - 1) % COMPANION_NAMES.length];
}

/** No avatar and no profile link: the avatar falls back to its placeholder and the header hides the Steam link. */
export function demoSteamProfile(accountId: number): SteamProfile {
  return {
    account_id: accountId,
    personaname: demoName(accountId),
    avatar: "",
    avatarmedium: "",
    avatarfull: "",
    profileurl: "",
    friends: [],
    last_updated: "",
    matches_played_last_30d: 0,
  };
}

interface HistoryFilter {
  gameMode?: string | null;
  matchMode?: string | null;
  heroIds?: string | null;
  minUnixTimestamp?: number | null;
  maxUnixTimestamp?: number | null;
}

function matchesFilter(entry: PlayerMatchHistoryEntry, filter: HistoryFilter): boolean {
  const brawl = entry.game_mode === GAME_MODE_STREET_BRAWL;
  if (filter.gameMode != null && (filter.gameMode === "street_brawl") !== brawl) return false;
  if (filter.matchMode != null && !brawl) {
    const mode = entry.match_mode === MATCH_MODE_RANKED ? "ranked" : "unranked";
    if (!filter.matchMode.split(",").includes(mode)) return false;
  }
  if (filter.heroIds != null && !filter.heroIds.split(",").map(Number).includes(entry.hero_id)) return false;
  if (filter.minUnixTimestamp != null && entry.start_time < filter.minUnixTimestamp) return false;
  if (filter.maxUnixTimestamp != null && entry.start_time > filter.maxUnixTimestamp) return false;
  return true;
}

const won = (entry: PlayerMatchHistoryEntry) => entry.match_result === entry.player_team;

export function demoHeroStats(history: readonly PlayerMatchHistoryEntry[], filter: HistoryFilter): HeroStats[] {
  const byHero = new Map<number, PlayerMatchHistoryEntry[]>();
  for (const entry of history) {
    if (!matchesFilter(entry, filter)) continue;
    byHero.set(entry.hero_id, [...(byHero.get(entry.hero_id) ?? []), entry]);
  }
  return [...byHero].map(([heroId, entries]) => {
    const rng = mulberry32(heroId);
    const sum = (value: (entry: PlayerMatchHistoryEntry) => number) =>
      entries.reduce((total, entry) => total + value(entry), 0);
    const minutes = sum((entry) => entry.match_duration_s) / 60;
    const netWorthPerMin = sum((entry) => entry.net_worth) / minutes;
    const damagePerMin = netWorthPerMin * between(rng, 0.65, 0.9);
    const damageTakenPerMin = netWorthPerMin * between(rng, 0.6, 0.85);
    const objDamagePerMin = netWorthPerMin * between(rng, 0.12, 0.25);
    return {
      account_id: DEMO_ACCOUNT_ID,
      hero_id: heroId,
      matches: entries.map((entry) => entry.match_id),
      matches_played: entries.length,
      wins: entries.filter(won).length,
      last_played: Math.max(...entries.map((entry) => entry.start_time)),
      time_played: sum((entry) => entry.match_duration_s),
      ending_level: sum((entry) => entry.hero_level) / entries.length,
      kills: sum((entry) => entry.player_kills),
      deaths: sum((entry) => entry.player_deaths),
      assists: sum((entry) => entry.player_assists),
      kills_per_min: sum((entry) => entry.player_kills) / minutes,
      deaths_per_min: sum((entry) => entry.player_deaths) / minutes,
      assists_per_min: sum((entry) => entry.player_assists) / minutes,
      networth_per_min: netWorthPerMin,
      last_hits_per_min: sum((entry) => entry.last_hits) / minutes,
      creeps_per_min: sum((entry) => entry.last_hits) / minutes,
      denies_per_min: sum((entry) => entry.denies) / minutes,
      denies_per_match: sum((entry) => entry.denies) / entries.length,
      accuracy: between(rng, 0.42, 0.58),
      crit_shot_rate: between(rng, 0.08, 0.2),
      damage_per_min: damagePerMin,
      damage_per_soul: damagePerMin / netWorthPerMin,
      damage_taken_per_min: damageTakenPerMin,
      damage_taken_per_soul: damageTakenPerMin / netWorthPerMin,
      damage_mitigated_per_min: damageTakenPerMin * between(rng, 0.15, 0.3),
      obj_damage_per_min: objDamagePerMin,
      obj_damage_per_soul: objDamagePerMin / netWorthPerMin,
      total_player_damage: damagePerMin * minutes,
      total_player_damage_taken: damageTakenPerMin * minutes,
      total_boss_damage: objDamagePerMin * minutes,
      total_creep_damage: damagePerMin * minutes * between(rng, 0.8, 1.1),
      total_neutral_damage: damagePerMin * minutes * between(rng, 0.2, 0.4),
      mvp_rank_counts: [],
      mvp_rated_matches: 0,
    };
  });
}

interface Roster {
  /** Five account ids on the demo player's team. */
  mates: number[];
  /** Six account ids on the other team. */
  enemies: number[];
}

/** Who a match was played with; a function of the match alone, so companion stats and match details agree. */
function matchRoster(matchId: number): Roster {
  const rng = mulberry32(matchId % 1_000_003);
  const mates = REGULAR_MATES.filter((mate) => rng() < mate.rate).map((mate) => DEMO_ACCOUNT_ID + mate.offset);
  const strangers = shuffled(
    rng,
    COMPANION_NAMES.map((_, index) => DEMO_ACCOUNT_ID + 1 + index).slice(REGULAR_MATES.length),
  );
  while (mates.length < 5) mates.push(strangers.pop()!);
  return { mates, enemies: strangers.slice(0, 6) };
}

function companionStats(history: readonly PlayerMatchHistoryEntry[], filter: HistoryFilter, side: keyof Roster) {
  const byCompanion = new Map<number, { matches: number[]; wins: number }>();
  for (const entry of history) {
    if (!matchesFilter(entry, filter)) continue;
    for (const accountId of matchRoster(entry.match_id)[side]) {
      const stats = byCompanion.get(accountId) ?? { matches: [], wins: 0 };
      stats.matches.push(entry.match_id);
      if (won(entry)) stats.wins++;
      byCompanion.set(accountId, stats);
    }
  }
  return [...byCompanion].map(([accountId, stats]) => ({
    accountId,
    matches: stats.matches,
    matches_played: stats.matches.length,
    wins: stats.wins,
  }));
}

export function demoMateStats(history: readonly PlayerMatchHistoryEntry[], filter: HistoryFilter): MateStats[] {
  return companionStats(history, filter, "mates").map(({ accountId, ...stats }) => ({ mate_id: accountId, ...stats }));
}

export function demoEnemyStats(history: readonly PlayerMatchHistoryEntry[], filter: HistoryFilter): EnemyStats[] {
  return companionStats(history, filter, "enemies").map(({ accountId, ...stats }) => ({
    enemy_id: accountId,
    ...stats,
  }));
}

/** The demo player's benchmark metrics: the cohort they are compared with, shifted a little per metric. */
export function demoPlayerMetrics(cohort: Record<string, HashMapValue>): Record<string, HashMapValue> {
  const rng = mulberry32(0xbe7c4);
  return Object.fromEntries(
    Object.entries(cohort).map(([key, value]) => {
      const factor = between(rng, 0.88, 1.22);
      const shifted = { ...value };
      for (const stat of Object.keys(shifted) as (keyof HashMapValue)[]) shifted[stat] *= factor;
      return [key, shifted];
    }),
  );
}

interface DemoAssets {
  heroes: readonly SlimHero[];
  items: readonly SlimUpgrade[];
  abilities: readonly TrackerAbility[];
}

function demoItems(rng: Rng, hero: SlimHero | undefined, assets: DemoAssets, durationS: number): TrackerMatchItem[] {
  const bought: TrackerMatchItem[] = [];
  const buy = (itemId: number, time: number, upgradeId = 0) =>
    bought.push({
      item_id: itemId,
      game_time_s: Math.round(time),
      sold_time_s: 0,
      upgrade_id: upgradeId,
      imbued_ability_id: 0,
    });

  const signatures = ["signature1", "signature2", "signature3", "signature4"].flatMap((slot) => {
    const ability = assets.abilities.find((candidate) => candidate.class_name === hero?.items[slot]);
    return ability ? [ability] : [];
  });
  signatures.forEach((ability, slot) => {
    buy(ability.id, [0, 120, 300, 480][slot]);
    for (let upgrade = 1; upgrade <= 3; upgrade++) {
      const time = durationS * (0.12 + 0.25 * upgrade + between(rng, -0.05, 0.05)) + slot * 45;
      if (time < durationS) buy(ability.id, time, upgrade);
    }
  });

  const shopStart = bought.length;
  // Each tier opens as the match goes on; a short match never reaches the expensive ones.
  const tierWindows = [
    { tier: 1, count: 4, from: 60, to: 420 },
    { tier: 2, count: 4, from: 420, to: 960 },
    { tier: 3, count: 3, from: 960, to: 1680 },
    { tier: 4, count: 2, from: 1680, to: 2520 },
  ];
  for (const { tier, count, from, to } of tierWindows) {
    const candidates = shuffled(
      rng,
      assets.items.filter((item) => item.shopable && !item.disabled && item.shop_image_webp && item.item_tier === tier),
    );
    for (const item of candidates.slice(0, count)) {
      const time = between(rng, from, to);
      if (time < durationS - 30) buy(item.id, time);
    }
  }
  const firstShopItem = bought.at(shopStart);
  if (firstShopItem && durationS > 1500) firstShopItem.sold_time_s = Math.round(durationS * between(rng, 0.7, 0.9));
  return bought;
}

interface Totals {
  kills: number;
  deaths: number;
  assists: number;
  netWorth: number;
  lastHits: number;
  denies: number;
  damage: number;
}

/** `curve` above 1 back-loads a player's income; a spread of curves lets the soul lead change hands. */
function demoTimeline(totals: Totals, durationS: number, curve: number): TrackerMatchStat[] {
  const times: number[] = [];
  for (let time = 180; time < durationS; time += 180) times.push(time);
  times.push(durationS);
  return times.map((time) => {
    const progress = time / durationS;
    // Income accelerates over a match, while kills and last hits come at a steadier pace.
    const late = progress ** curve;
    return {
      time_stamp_s: time,
      net_worth: Math.round(totals.netWorth * late),
      kills: Math.floor(totals.kills * progress),
      deaths: Math.floor(totals.deaths * progress),
      assists: Math.floor(totals.assists * progress),
      creep_kills: Math.round(totals.lastHits * progress),
      denies: Math.round(totals.denies * progress),
      player_damage: Math.round(totals.damage * late),
    };
  });
}

/** Spreads `total` over `parts` slots as evenly as the roll allows. */
function distribute(rng: Rng, total: number, parts: number): number[] {
  const shares = Array<number>(parts).fill(0);
  for (let i = 0; i < total; i++) shares[Math.floor(rng() * parts)]++;
  return shares;
}

function demoObjectives(rng: Rng, winningTeam: string, durationS: number): TrackerObjective[] {
  const objectives: TrackerObjective[] = [];
  const destroy = (team: string, kind: TrackerObjectiveKind, count: number, from: number, to: number) => {
    for (let i = 0; i < count; i++) {
      objectives.push({ team, kind, destroyed_time_s: Math.round(durationS * between(rng, from, to)) });
    }
  };
  for (const { key: team } of TEAMS) {
    const lost = team !== winningTeam;
    destroy(team, "guardian", lost ? 4 : intBetween(rng, 2, 4), 0.15, 0.4);
    destroy(team, "walker", lost ? 4 : intBetween(rng, 0, 3), 0.4, 0.75);
    if (!lost) continue;
    destroy(team, "baseGuardian", intBetween(rng, 2, 4), 0.75, 0.9);
    destroy(team, "shrine", 2, 0.88, 0.95);
    destroy(team, "patron", 1, 0.96, 0.98);
    objectives.push({ team, kind: "patronCore", destroyed_time_s: durationS });
  }
  return objectives.sort((a, b) => a.destroyed_time_s - b.destroyed_time_s);
}

/** Full details of one generated match, consistent with its row in `history`; null for an unknown match id. */
export function demoMatchMetadata(
  matchId: number,
  history: readonly PlayerMatchHistoryEntry[],
  assets: DemoAssets,
): TrackerMatchMetadata | null {
  const entry = history.find((candidate) => candidate.match_id === matchId);
  if (!entry) return null;
  const rng = mulberry32(demoMatchIndex(matchId) + 0x5eed);
  const durationS = entry.match_duration_s;
  const minutes = durationS / 60;
  const laned = entry.game_mode === GAME_MODE_NORMAL;
  const ranked = entry.match_mode === MATCH_MODE_RANKED;
  const ownTeam = TEAMS[entry.player_team].key;
  const enemyTeam = TEAMS[1 - entry.player_team].key;
  const winningTeam = TEAMS[entry.match_result].key;
  const badge = entry.ranked_display_badge ?? demoRank(history).badge;

  const roster = matchRoster(matchId);
  const otherHeroes = shuffled(
    rng,
    assets.heroes.filter((hero) => hero.player_selectable && !hero.disabled && hero.id !== entry.hero_id),
  );
  const seats = [
    { accountId: DEMO_ACCOUNT_ID, team: ownTeam, heroId: entry.hero_id },
    ...roster.mates.map((accountId, i) => ({ accountId, team: ownTeam, heroId: otherHeroes[i]?.id ?? 0 })),
    ...roster.enemies.map((accountId, i) => ({ accountId, team: enemyTeam, heroId: otherHeroes[5 + i]?.id ?? 0 })),
  ];

  const kills = seats.map((seat, i) =>
    i === 0
      ? entry.player_kills
      : Math.round(minutes * between(rng, 0.1, 0.3) * (seat.team === winningTeam ? 1.15 : 0.85)),
  );
  const teamKills = (team: string) => seats.reduce((sum, seat, i) => sum + (seat.team === team ? kills[i] : 0), 0);
  // The demo player's deaths come from their history row, so the enemy team needs at least that many kills.
  const shortfall = entry.player_deaths - teamKills(enemyTeam);
  if (shortfall > 0) kills[6] += shortfall;
  const mateDeaths = distribute(rng, teamKills(enemyTeam) - entry.player_deaths, 5);
  const enemyDeaths = distribute(rng, teamKills(ownTeam), 6);
  const deaths = [entry.player_deaths, ...mateDeaths, ...enemyDeaths];

  const deathDetails: TrackerPlayerDeaths[] = seats.map((seat, i) => ({
    account_id: seat.accountId,
    player_slot: i + 1,
    death_details: [],
  }));
  for (const team of [ownTeam, enemyTeam]) {
    const killers = shuffled(
      rng,
      seats.flatMap((seat, i) => (seat.team === team ? [] : Array<number>(kills[i]).fill(i + 1))),
    );
    const victims = shuffled(
      rng,
      seats.flatMap((seat, i) => (seat.team === team ? Array<number>(deaths[i]).fill(i) : [])),
    );
    victims.forEach((victim, n) => {
      const time = Math.round(durationS * between(rng, 0.08, 0.98) ** 0.8);
      deathDetails[victim].death_details.push({
        game_time_s: time,
        killer_player_slot: killers[n] ?? null,
        death_duration_s: Math.round(8 + (time / durationS) * 55),
        time_to_kill_s: Math.round(between(rng, 1, 9) * 10) / 10,
      });
    });
  }
  for (const player of deathDetails) player.death_details.sort((a, b) => a.game_time_s - b.game_time_s);

  // The demo player's souls come from their history row; their teammates make up the rest of a team total that
  // leaves the loser a believable distance behind, whatever the demo player earned.
  const netWorths = seats.map((_, i) => (i === 0 ? entry.net_worth : Math.round(minutes * between(rng, 850, 1250))));
  const teamSouls = (team: string) => seats.reduce((sum, seat, i) => sum + (seat.team === team ? netWorths[i] : 0), 0);
  const enemySouls = teamSouls(enemyTeam);
  const ownTarget = enemySouls * (ownTeam === winningTeam ? between(rng, 1.04, 1.14) : between(rng, 0.88, 0.96));
  const mateScale = (ownTarget - entry.net_worth) / (teamSouls(ownTeam) - entry.net_worth);
  for (let i = 1; i <= 5; i++) netWorths[i] = Math.round(netWorths[i] * mateScale);

  const players: TrackerMatchPlayer[] = seats.map((seat, i) => {
    const tracked = i === 0;
    const onWinningTeam = seat.team === winningTeam;
    const netWorth = netWorths[i];
    const damage = Math.round(netWorth * between(rng, 0.6, 0.95));
    const totals: Totals = {
      kills: kills[i],
      deaths: deaths[i],
      assists: tracked ? entry.player_assists : Math.round(minutes * between(rng, 0.2, 0.45)),
      netWorth,
      lastHits: tracked ? entry.last_hits : Math.round(minutes * between(rng, 3.5, 7)),
      denies: tracked ? entry.denies : Math.round(minutes * between(rng, 0.1, 0.7)),
      damage,
    };
    const shots = intBetween(rng, 900, 2600);
    const hits = Math.round(shots * between(rng, 0.35, 0.6));
    const noFalloff = Math.round(hits * between(rng, 0.5, 0.8));
    const incomingShots = intBetween(rng, 900, 2600);
    return {
      account_id: seat.accountId,
      team: seat.team,
      hero_id: seat.heroId,
      pregame_hero_id: null,
      combat_stats: combatStats([
        {
          time_stamp_s: durationS,
          custom_user_stats: {
            "Enemy Hero Accuracy##Shots": shots,
            "Enemy Hero Accuracy##Hits": hits,
            "Enemy Hero Accuracy##Headshots": Math.round(hits * between(rng, 0.08, 0.25)),
            "Enemy Hero Falloff##No Falloff": noFalloff,
            "Enemy Hero Falloff##Partial Falloff": Math.round((hits - noFalloff) * 0.7),
            "Enemy Hero Falloff##Max Falloff": Math.round((hits - noFalloff) * 0.3),
            "Enemy Hero Accuracy - Incoming##Shots": incomingShots,
            "Enemy Hero Accuracy - Incoming##Hits": Math.round(incomingShots * between(rng, 0.3, 0.55)),
          },
        },
      ]),
      assigned_lane: laned ? LANE_IDS[(seat.team === ownTeam ? i : i - 6) % LANE_IDS.length] : 0,
      kills: totals.kills,
      deaths: totals.deaths,
      assists: totals.assists,
      net_worth: netWorth,
      level: tracked ? entry.hero_level : Math.min(36, Math.round(minutes * between(rng, 0.8, 1))),
      last_hits: totals.lastHits,
      denies: totals.denies,
      player_damage: damage,
      player_damage_taken: Math.round(netWorth * between(rng, 0.55, 0.9)),
      boss_damage: Math.round(netWorth * between(rng, 0.08, 0.3)),
      player_healing: Math.round(netWorth * between(rng, 0.05, 0.35)),
      mvp_rank: null,
      rank_badge: ranked ? badge : null,
      rank_delta: tracked
        ? (entry.ranked_delta ?? null)
        : ranked
          ? (onWinningTeam ? 1 : -1) * intBetween(rng, 15, 28)
          : null,
      demotion_protected: false,
      ability_stacks: {},
      items: demoItems(
        rng,
        assets.heroes.find((hero) => hero.id === seat.heroId),
        assets,
        durationS,
      ),
      stats: demoTimeline(totals, durationS, between(rng, 1, 1.7)),
      personaname: demoName(seat.accountId),
    };
  });

  const midBossClaims = laned && durationS > 1500 ? intBetween(rng, 0, 2) : 0;
  return {
    winning_team: winningTeam,
    average_badge_team0: ranked ? badge : null,
    average_badge_team1: ranked ? badge : null,
    players,
    objectives: laned ? demoObjectives(rng, winningTeam, durationS) : [],
    mid_boss: Array.from({ length: midBossClaims }, (_, n) => ({
      team_claimed: rng() < 0.65 ? winningTeam : pick(rng, TEAMS).key,
      destroyed_time_s: Math.round(durationS * (0.5 + 0.3 * n + between(rng, 0, 0.15))),
    })),
    deaths: deathDetails,
  };
}
