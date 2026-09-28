import type { HeroStats } from "deadlock_api_client";

import type { PlayerMetricFormat } from "~/lib/player-metrics";

/** How many players one comparison holds. */
export const MAX_COMPARE_PLAYERS = 5;

/**
 * Each player's series color index: their place among the players sorted by account id. A player keeps their color
 * when the columns are reordered (the order is the reader's, the color is the player's), and the colors in use are
 * always the first ones of the palette, in its validated order.
 */
export function compareColorIndexes(accountIds: readonly number[]): number[] {
  const sorted = [...accountIds].sort((a, b) => a - b);
  return accountIds.map((accountId) => sorted.indexOf(accountId));
}

/** Account ids are SteamID3 numbers, unsigned 32-bit; the API rejects a whole request carrying a larger one. */
const MAX_ACCOUNT_ID = 2 ** 32 - 1;

/** The ids of a comparison as the URL carries them: valid account ids, each once, in order, at most five. */
export function parseCompareIds(ids: readonly number[] | null | undefined): number[] {
  const unique: number[] = [];
  for (const id of ids ?? []) {
    if (!Number.isSafeInteger(id) || id <= 0 || id > MAX_ACCOUNT_ID || unique.includes(id)) continue;
    unique.push(id);
    if (unique.length === MAX_COMPARE_PLAYERS) break;
  }
  return unique;
}

/** One player's line over every hero the filters kept. */
export interface PlayerAggregate {
  matches: number;
  winRate: number;
  kda: number;
  kills: number;
  deaths: number;
  assists: number;
  netWorthPerMin: number;
  damagePerMin: number;
  damageTakenPerMin: number;
  objDamagePerMin: number;
  lastHitsPerMin: number;
  deniesPerMatch: number;
  accuracy: number;
  critShotRate: number;
  /** Null while none of the matches was rated. */
  mvpRate: number | null;
  /** Share of rated matches finished first, second or third on the scoreboard. */
  top3Rate: number | null;
  /** Hero damage per soul earned: how well the farm turns into fights. Null without any souls. */
  damagePerSoul: number | null;
  damageMitigatedPerMin: number;
  heroesPlayed: number;
  avgMatchSeconds: number;
  /**
   * From outside the hero stats: the per-player metrics (healing, heal prevented) and the current rank. Undefined
   * while they load, null when there is none (an unranked player is null, not badge 0).
   */
  healingPerMin: number | null | undefined;
  healPreventedPerMatch: number | null | undefined;
  rankBadge: number | null | undefined;
}

/**
 * Sums a player's rows over heroes. Totals add up, per-minute rates are weighted by time played (the API computes
 * them as a total over the time), and per-match averages and shot rates by matches.
 */
export function aggregateHeroStats(rows: readonly HeroStats[], accountId: number): PlayerAggregate | null {
  const own = rows.filter((row) => row.account_id === accountId && row.matches_played > 0);
  const matches = own.reduce((sum, row) => sum + row.matches_played, 0);
  if (matches === 0) return null;
  const time = own.reduce((sum, row) => sum + row.time_played, 0);
  const total = (pick: (row: HeroStats) => number) => own.reduce((sum, row) => sum + pick(row), 0);
  const perMatch = (pick: (row: HeroStats) => number) => total((row) => pick(row) * row.matches_played) / matches;
  const perTime = (pick: (row: HeroStats) => number) =>
    time > 0 ? total((row) => pick(row) * row.time_played) / time : perMatch(pick);
  const kills = total((row) => row.kills);
  const deaths = total((row) => row.deaths);
  const assists = total((row) => row.assists);
  const mvpRated = total((row) => row.mvp_rated_matches);
  const top3s = total((row) => row.mvp_rank_counts.slice(0, 3).reduce((sum, count) => sum + count, 0));
  // The API's damage per soul is a ratio of totals per hero; souls come back from the rate and the time.
  const souls = total((row) => (row.networth_per_min * row.time_played) / 60);
  return {
    matches,
    winRate: total((row) => row.wins) / matches,
    kda: (kills + assists) / Math.max(1, deaths),
    kills: kills / matches,
    deaths: deaths / matches,
    assists: assists / matches,
    netWorthPerMin: perTime((row) => row.networth_per_min),
    damagePerMin: perTime((row) => row.damage_per_min),
    damageTakenPerMin: perTime((row) => row.damage_taken_per_min),
    objDamagePerMin: perTime((row) => row.obj_damage_per_min),
    lastHitsPerMin: perTime((row) => row.last_hits_per_min),
    deniesPerMatch: perMatch((row) => row.denies_per_match),
    accuracy: perMatch((row) => row.accuracy),
    critShotRate: perMatch((row) => row.crit_shot_rate),
    mvpRate: mvpRated > 0 ? total((row) => row.mvp_rank_counts[0] ?? 0) / mvpRated : null,
    top3Rate: mvpRated > 0 ? top3s / mvpRated : null,
    damagePerSoul: souls > 0 ? total((row) => row.total_player_damage) / souls : null,
    damageMitigatedPerMin: perTime((row) => row.damage_mitigated_per_min),
    heroesPlayed: own.length,
    avgMatchSeconds: time / matches,
    healingPerMin: undefined,
    healPreventedPerMatch: undefined,
    rankBadge: undefined,
  };
}

/** Which way is better; `none` is shown but never won (the match count is context, not skill). */
export type StatPolarity = "higher" | "lower" | "none";

export type CompareStatKey = keyof PlayerAggregate;

/** The sections of the head-to-head table, in order. */
export const COMPARE_STAT_GROUPS = ["Overview", "Combat", "Economy", "Objectives & support"] as const;
export type CompareStatGroup = (typeof COMPARE_STAT_GROUPS)[number];

export interface CompareStat {
  key: CompareStatKey;
  label: string;
  /** `rank` is a badge, drawn as the rank's name. */
  format: PlayerMetricFormat | "rank";
  polarity: StatPolarity;
  group: CompareStatGroup;
}

/** Every stat of a comparison, in table order: grouped, and within a group the ones people quote first. */
export const COMPARE_STATS: readonly CompareStat[] = [
  { key: "matches", label: "Matches", format: "integer", polarity: "none", group: "Overview" },
  { key: "heroesPlayed", label: "Heroes played", format: "integer", polarity: "none", group: "Overview" },
  { key: "avgMatchSeconds", label: "Average match", format: "duration", polarity: "none", group: "Overview" },
  { key: "rankBadge", label: "Current rank", format: "rank", polarity: "higher", group: "Overview" },
  { key: "winRate", label: "Win rate", format: "percent", polarity: "higher", group: "Overview" },
  { key: "mvpRate", label: "MVP rate", format: "percent", polarity: "higher", group: "Overview" },
  { key: "top3Rate", label: "Top 3 rate", format: "percent", polarity: "higher", group: "Overview" },
  { key: "kda", label: "KDA", format: "decimal2", polarity: "higher", group: "Combat" },
  { key: "kills", label: "Kills / match", format: "decimal1", polarity: "higher", group: "Combat" },
  { key: "deaths", label: "Deaths / match", format: "decimal1", polarity: "lower", group: "Combat" },
  { key: "assists", label: "Assists / match", format: "decimal1", polarity: "higher", group: "Combat" },
  { key: "damagePerMin", label: "Hero damage / min", format: "integer", polarity: "higher", group: "Combat" },
  { key: "accuracy", label: "Accuracy", format: "percent", polarity: "higher", group: "Combat" },
  { key: "critShotRate", label: "Headshot rate", format: "percent", polarity: "higher", group: "Combat" },
  { key: "netWorthPerMin", label: "Souls / min", format: "integer", polarity: "higher", group: "Economy" },
  { key: "damagePerSoul", label: "Damage per soul", format: "decimal2", polarity: "higher", group: "Economy" },
  { key: "lastHitsPerMin", label: "Last hits / min", format: "decimal1", polarity: "higher", group: "Economy" },
  { key: "deniesPerMatch", label: "Denies / match", format: "decimal1", polarity: "higher", group: "Economy" },
  {
    key: "objDamagePerMin",
    label: "Obj. damage / min",
    format: "integer",
    polarity: "higher",
    group: "Objectives & support",
  },
  {
    key: "damageMitigatedPerMin",
    label: "Mitigated / min",
    format: "integer",
    polarity: "higher",
    group: "Objectives & support",
  },
  {
    key: "healingPerMin",
    label: "Healing / min",
    format: "integer",
    polarity: "higher",
    group: "Objectives & support",
  },
  {
    key: "healPreventedPerMatch",
    label: "Heal prevented",
    format: "integer",
    polarity: "higher",
    group: "Objectives & support",
  },
];

/** The stats a comparison can be won on; a row drops out when no player has it, so copy says "up to". */
export const SCORED_STAT_COUNT = COMPARE_STATS.filter((stat) => stat.polarity !== "none").length;

/**
 * The indexes holding the best value of one stat. Ties share the win; players without a value never win; with
 * fewer than two values, or a stat nobody wins, nobody does.
 */
export function statWinners(values: readonly (number | null | undefined)[], polarity: StatPolarity): number[] {
  if (polarity === "none") return [];
  const present = values.flatMap((value, index) => (value != null && Number.isFinite(value) ? [{ value, index }] : []));
  if (present.length < 2) return [];
  const best =
    polarity === "higher"
      ? Math.max(...present.map((entry) => entry.value))
      : Math.min(...present.map((entry) => entry.value));
  // Every value tied: nobody is better than anybody.
  if (present.every((entry) => entry.value === best)) return [];
  return present.filter((entry) => entry.value === best).map((entry) => entry.index);
}

/**
 * A value as the table prints it, back as a number: the same rounding as `formatStatValue` (`toFixed` for decimals and
 * percentages, `Math.round` for whole numbers), so 1.45 and 1.4, both printed "1.4", compare equal.
 */
function shownValue(value: number, format: CompareStat["format"]): number {
  switch (format) {
    case "percent":
      return Number((value * 100).toFixed(1));
    case "decimal1":
      return Number(value.toFixed(1));
    case "decimal2":
      return Number(value.toFixed(2));
    default:
      return Math.round(value);
  }
}

/**
 * The winners of one stat, judged on the values as the table prints them: two players both shown with a 4.25 KDA
 * share the win rather than one of them winning on the third decimal.
 */
export function compareStatWinners(
  aggregates: readonly (PlayerAggregate | null | undefined)[],
  stat: Pick<CompareStat, "key" | "format" | "polarity">,
): number[] {
  return statWinners(
    aggregates.map((aggregate) => {
      const value = aggregate?.[stat.key];
      return value == null || !Number.isFinite(value) ? value : shownValue(value, stat.format);
    }),
    stat.polarity,
  );
}

/** How many stats each player wins, in the players' order. */
export function statTally(aggregates: readonly (PlayerAggregate | null)[], stats = COMPARE_STATS): number[] {
  const tally = aggregates.map(() => 0);
  for (const stat of stats) {
    for (const index of compareStatWinners(aggregates, stat)) {
      tally[index] += 1;
    }
  }
  return tally;
}

export interface SharedHeroStats {
  matches: number;
  wins: number;
  winRate: number;
  kda: number;
  kills: number;
  deaths: number;
  assists: number;
  netWorthPerMin: number;
  damagePerMin: number;
  /** Unix seconds. */
  lastPlayed: number;
}

export interface SharedHeroRow {
  heroId: number;
  /** Per player, in the players' order; null for one who never played the hero. */
  stats: (SharedHeroStats | null)[];
  totalMatches: number;
}

/** Heroes at least two of the players have played, most played first. */
export function sharedHeroes(rows: readonly HeroStats[], accountIds: readonly number[]): SharedHeroRow[] {
  const byHero = new Map<number, SharedHeroRow>();
  for (const row of rows) {
    const index = accountIds.indexOf(row.account_id);
    if (index === -1 || row.matches_played === 0) continue;
    const entry = byHero.get(row.hero_id) ?? {
      heroId: row.hero_id,
      stats: accountIds.map(() => null),
      totalMatches: 0,
    };
    entry.stats[index] = {
      matches: row.matches_played,
      wins: row.wins,
      winRate: row.wins / row.matches_played,
      kda: (row.kills + row.assists) / Math.max(1, row.deaths),
      kills: row.kills / row.matches_played,
      deaths: row.deaths / row.matches_played,
      assists: row.assists / row.matches_played,
      netWorthPerMin: row.networth_per_min,
      damagePerMin: row.damage_per_min,
      lastPlayed: row.last_played,
    };
    entry.totalMatches += row.matches_played;
    byHero.set(row.hero_id, entry);
  }
  return [...byHero.values()]
    .filter((entry) => entry.stats.filter(Boolean).length >= 2)
    .sort((a, b) => b.totalMatches - a.totalMatches || a.heroId - b.heroId);
}

/** Distribution metrics where less is better, so the top of the field is the low end of the curve. */
export const LOWER_IS_BETTER_METRICS: ReadonlySet<string> = new Set(["deaths", "player_damage_taken_per_min"]);

/**
 * Where a value ranks among all players, as a reader says it: "Top 1%" for the best of the field, "Bottom 30%" for
 * the lower half. `atOrBelow` is the share of players (0-100) at or below the value.
 */
export function rankShareLabel(atOrBelow: number, lowerIsBetter = false): string {
  const top = lowerIsBetter ? atOrBelow : 100 - atOrBelow;
  if (top <= 50) return `Top ${Math.max(1, Math.round(top))}%`;
  return `Bottom ${Math.max(1, Math.round(100 - top))}%`;
}

/**
 * The scoring of a comparison, as the head-to-head table and the share card both show it. `aggregates` holds each
 * player's line: undefined while it loads, null without matches. A stat nobody has a value for is left out and not
 * scored; `settled` is false while a value that could change the winners is still loading.
 */
export function scoreComparison(aggregates: readonly (PlayerAggregate | null | undefined)[]) {
  const stats = COMPARE_STATS.filter((stat) =>
    aggregates.some((aggregate) => aggregate === undefined || (aggregate !== null && aggregate[stat.key] !== null)),
  );
  const scored = stats.filter((stat) => stat.polarity !== "none");
  const settled = aggregates.every(
    (aggregate) =>
      aggregate === null || (aggregate !== undefined && scored.every((stat) => aggregate[stat.key] !== undefined)),
  );
  const tally = statTally(
    aggregates.map((aggregate) => aggregate ?? null),
    scored,
  );
  const lead = Math.max(0, ...tally);
  /** The players with the most stats won; nobody leads before two players are scored or while nothing is won. */
  const leaders =
    aggregates.filter(Boolean).length >= 2 && lead > 0
      ? tally.flatMap((count, index) => (count === lead ? [index] : []))
      : [];
  return { stats, scored, tally, leaders, settled };
}
