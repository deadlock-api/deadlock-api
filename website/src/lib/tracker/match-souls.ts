import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

/**
 * A player's soul income by source at the end of the match, named as the stats name it (the GraphQL fields add
 * `max_`, the game stats `avg_`). The hero kill souls (`gold_player`) include the assist souls.
 */
export const SOUL_FIELDS = [
  "gold_player",
  "gold_player_orbs",
  "gold_lane_creep",
  "gold_lane_creep_orbs",
  "gold_neutral_creep",
  "gold_neutral_creep_orbs",
  "gold_boss",
  "gold_boss_orb",
  "gold_treasure",
  "gold_death_loss",
  "gold_assists",
  "gold_team_bonus",
  "gold_breakable",
  "gold_ability_assassinate",
  "gold_item_trophy_collector",
  "gold_item_cultist_sacrifice",
  "gold_item_goose_egg",
] as const;

export type SoulField = (typeof SOUL_FIELDS)[number];

/** The custom stat that sums the souls a player held unspent over every minute of the match. */
export const UNSPENT_SOUL_MINUTES = "Unspent Gold Minutes";
/** The custom stat that counts the breakables a player broke for souls. */
export const BREAKABLES_BROKEN = "PowerUp Gold";
export type PlayerSouls = Record<SoulField, number>;

const isSoulField = (name: string): name is SoulField => (SOUL_FIELDS as readonly string[]).includes(name);

/** The stats field a game stats key (`avg_gold_lane_creep`) names, or undefined for one a player row lacks. */
export function soulFieldOf(statKey: string): SoulField | undefined {
  const name = statKey.replace(/^avg_/, "");
  return isSoulField(name) ? name : undefined;
}

/** Null when the row has none of the fields: a match ingested before they were recorded. */
export function soulsFrom(read: (field: SoulField) => number | null | undefined): PlayerSouls | null {
  let any = false;
  const souls = {} as PlayerSouls;
  for (const field of SOUL_FIELDS) {
    const value = read(field);
    if (value != null && Number.isFinite(value)) any = true;
    souls[field] = value != null && Number.isFinite(value) ? value : 0;
  }
  return any ? souls : null;
}

/** `EGoldSource` of the REST stats' `gold_sources`, for the sources a REST stats sample has no field of its own for. */
const REST_GOLD_SOURCE: Partial<Record<SoulField, number>> = {
  gold_assists: 6,
  gold_team_bonus: 8,
  gold_ability_assassinate: 9,
  gold_item_trophy_collector: 10,
  gold_item_cultist_sacrifice: 11,
  gold_breakable: 12,
  gold_item_goose_egg: 13,
};

export interface RestSoulSample {
  time_stamp_s?: number;
  gold_sources?: { source?: number; gold?: number | null }[] | null;
  [field: string]: unknown;
}

/** The souls of the REST metadata's latest stats sample. */
export function restSouls(samples: readonly RestSoulSample[] | null | undefined): PlayerSouls | null {
  let latest: RestSoulSample | undefined;
  for (const sample of samples ?? []) {
    if (!latest || (sample.time_stamp_s ?? 0) >= (latest.time_stamp_s ?? 0)) latest = sample;
  }
  if (!latest) return null;
  const sample = latest;
  return soulsFrom((field) => {
    const source = REST_GOLD_SOURCE[field];
    if (source !== undefined) return sample.gold_sources?.find((entry) => entry.source === source)?.gold ?? null;
    const value = sample[field];
    return typeof value === "number" ? value : null;
  });
}

/** One kind of permanent buff a player picked up from statues, e.g. `hp_permanent_pickup_lv2` twice. */
export interface PermanentBuff {
  type: string;
  count: number;
}

/** The permanent entries of `power_up_buffs`, spelled the same in the REST and GraphQL payloads. */
export function permanentBuffs(raw: unknown): PermanentBuff[] {
  if (!Array.isArray(raw)) return [];
  const buffs: PermanentBuff[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || entry.is_permanent !== true || typeof entry.type !== "string") continue;
    // `value` counts the pickups, one per entry of `pickup_times_s` where the row has them.
    const times = Array.isArray(entry.pickup_times_s) ? entry.pickup_times_s.length : 0;
    const count = Math.max(typeof entry.value === "number" ? entry.value : 0, times);
    if (count > 0) buffs.push({ type: entry.type, count });
  }
  return buffs;
}

export const permanentBuffCount = (buffs: readonly PermanentBuff[]) => buffs.reduce((sum, buff) => sum + buff.count, 0);

/** The stat a permanent buff raises, by the stem of its type (`hp` in `hp_permanent_pickup_lv2`). */
const BUFF_STATS: Record<string, string> = {
  hp: "Health",
  wp: "Weapon damage",
  spirit: "Spirit power",
  firerate: "Fire rate",
  ammo: "Ammo",
  cd: "Cooldown reduction",
  bulletresist: "Bullet resist",
  spiritresist: "Spirit resist",
  range: "Ability range",
  movespeed: "Move speed",
};

/** "Health", or the raw type for one the site does not know yet. */
export function permanentBuffStat(type: string): string {
  return BUFF_STATS[type.split("_")[0]] ?? type.replaceAll("_", " ");
}

/** Every pickup of the same stat together, whatever tier of statue it came from, most picked first. */
export function permanentBuffsByStat(buffs: readonly PermanentBuff[]): { stat: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const buff of buffs) {
    const stat = permanentBuffStat(buff.type);
    counts.set(stat, (counts.get(stat) ?? 0) + buff.count);
  }
  return [...counts]
    .map(([stat, count]) => ({ stat, count }))
    .sort((a, b) => b.count - a.count || a.stat.localeCompare(b.stat));
}

/** What a player's souls mean against their team and the lobby. */
export interface SoulContext {
  /**
   * Urn souls the player delivered themselves. `gold_treasure` also holds the payout every teammate gets, so the
   * team's most common reading is that shared part, and what a player has above it is their own delivery.
   */
  urnDelivered: number;
  urnShared: number;
  /** Souls held unspent at an average moment of the match; null without the game's `Unspent Gold Minutes`. */
  unspentPerMin: number | null;
  /** 1 for the player who held the most unspent, among the `unspentOf` players with a reading. */
  unspentRank: number | null;
  unspentOf: number;
}

/**
 * The urn souls every member of a team got: the reading most of them share, the lower one on a tie. The minimum would
 * undercount it when a player joined late or left early and missed a payout.
 */
function sharedUrnSouls(readings: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const reading of readings) counts.set(reading, (counts.get(reading) ?? 0) + 1);
  let shared = 0;
  let best = 0;
  for (const [reading, count] of counts) {
    if (count > best || (count === best && reading < shared)) {
      shared = reading;
      best = count;
    }
  }
  return shared;
}

export function soulContexts(players: readonly TrackerMatchPlayer[], durationS: number): Map<number, SoulContext> {
  const minutes = durationS / 60;
  const teamUrns = new Map<string, number[]>();
  for (const player of players) {
    if (!player.souls) continue;
    teamUrns.set(player.team, [...(teamUrns.get(player.team) ?? []), player.souls.gold_treasure]);
  }
  const shared = new Map([...teamUrns].map(([team, readings]) => [team, sharedUrnSouls(readings)]));
  const unspent = players
    .flatMap((player) => (player.unspent_soul_minutes != null && minutes > 0 ? [player.unspent_soul_minutes] : []))
    .sort((a, b) => b - a);
  const contexts = new Map<number, SoulContext>();
  for (const player of players) {
    const treasure = player.souls?.gold_treasure ?? 0;
    const teamShare = Math.min(treasure, shared.get(player.team) ?? 0);
    const minutesHeld = player.unspent_soul_minutes;
    const held = minutesHeld != null && minutes > 0;
    contexts.set(player.account_id, {
      urnDelivered: treasure - teamShare,
      urnShared: teamShare,
      unspentPerMin: held ? minutesHeld / minutes : null,
      unspentRank: held ? unspent.indexOf(minutesHeld) + 1 : null,
      unspentOf: unspent.length,
    });
  }
  return contexts;
}
