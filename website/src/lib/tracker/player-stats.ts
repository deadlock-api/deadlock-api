import type { TrackerMatchMetadata, TrackerMatchPlayer } from "~/queries/tracker-queries";

/** One scoreboard measure, told apart from the others by the width at which the table can afford it. */
export interface PlayerStatColumn {
  key: string;
  /** Column header, kept to a few characters so eight of them fit a half-width panel. */
  short: string;
  /** What the header abbreviates, for the header's title and the hover card. */
  label: string;
  value: (player: TrackerMatchPlayer) => number;
  format: (value: number) => string;
  barClassName: string;
  /** Container width the column appears at; narrower panels list it under the player instead. */
  reveal: keyof typeof REVEAL;
}

/**
 * Paired visibility: every column the table drops at a given width is listed under the player's name instead,
 * so the stats stay reachable on a phone, where there is no pointer to hover with.
 */
export const REVEAL = {
  always: { cell: "", strip: "hidden" },
  sm: { cell: "hidden @sm:table-cell", strip: "@sm:hidden" },
  md: { cell: "hidden @md:table-cell", strip: "@md:hidden" },
  lg: { cell: "hidden @lg:table-cell", strip: "@lg:hidden" },
} as const;

const whole = (value: number) => Math.round(value).toLocaleString("en-US");

/** Damage runs to five digits, which no half-width panel can spare eight times over. */
export function compactNumber(value: number): string {
  if (value < 1000) return String(Math.round(value));
  const thousands = value / 1000;
  return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1)}k`;
}

export const PLAYER_STAT_COLUMNS: PlayerStatColumn[] = [
  {
    key: "souls",
    short: "Souls",
    label: "Souls",
    value: (player) => player.net_worth,
    format: whole,
    barClassName: "bg-amber-500/15",
    reveal: "always",
  },
  {
    key: "damage",
    short: "Dmg",
    label: "Hero damage",
    value: (player) => player.player_damage,
    format: compactNumber,
    barClassName: "bg-primary/15",
    reveal: "sm",
  },
  {
    key: "lastHits",
    short: "LH",
    label: "Last hits",
    value: (player) => player.last_hits,
    format: whole,
    barClassName: "bg-sky-500/15",
    reveal: "md",
  },
  {
    key: "denies",
    short: "DN",
    label: "Denies",
    value: (player) => player.denies,
    format: whole,
    barClassName: "bg-sky-500/15",
    reveal: "md",
  },
  {
    key: "damageTaken",
    short: "Taken",
    label: "Damage taken",
    value: (player) => player.player_damage_taken,
    format: compactNumber,
    barClassName: "bg-orange-500/15",
    reveal: "lg",
  },
  {
    key: "bossDamage",
    short: "Obj",
    label: "Objective damage",
    value: (player) => player.boss_damage,
    format: compactNumber,
    barClassName: "bg-violet-500/15",
    reveal: "lg",
  },
  {
    key: "healing",
    short: "Heal",
    label: "Healing",
    value: (player) => player.player_healing,
    format: compactNumber,
    barClassName: "bg-emerald-500/15",
    reveal: "lg",
  },
];

/** The lobby's best in each column, which the row bars are drawn against. */
export function statMaxima(players: TrackerMatchPlayer[]): Record<string, number> {
  const maxima: Record<string, number> = {};
  for (const column of PLAYER_STAT_COLUMNS) {
    let max = 0;
    for (const player of players) max = Math.max(max, column.value(player));
    maxima[column.key] = max;
  }
  return maxima;
}

/** What a player did that no single column holds, worked out against their team and the match length. */
export interface PlayerContext {
  /** Share of the team's kills the player took part in, in `[0,1]`. */
  killShare: number;
  /** Share of the team's hero damage, in `[0,1]`. */
  damageShare: number;
  soulsPerMin: number;
  /** Seconds spent waiting to respawn, or null when the match records no deaths for them. */
  deadForS: number | null;
}

export function playerContext(
  match: TrackerMatchMetadata,
  player: TrackerMatchPlayer,
  durationS: number,
): PlayerContext {
  let teamKills = 0;
  let teamDamage = 0;
  for (const mate of match.players) {
    if (mate.team !== player.team) continue;
    teamKills += mate.kills;
    teamDamage += mate.player_damage;
  }
  const deaths = match.deaths.find((row) => row.account_id === player.account_id);
  return {
    killShare: teamKills > 0 ? (player.kills + player.assists) / teamKills : 0,
    damageShare: teamDamage > 0 ? player.player_damage / teamDamage : 0,
    soulsPerMin: durationS > 0 ? player.net_worth / (durationS / 60) : 0,
    deadForS: deaths ? deaths.death_details.reduce((sum, death) => sum + death.death_duration_s, 0) : null,
  };
}
