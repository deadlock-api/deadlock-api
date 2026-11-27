import { brawlMode, damageSplit, hasDamageMatrix, hasDetails, mainMode } from "./recap";
import type { YearRecap } from "./types";

export type RecapChapterId =
  | "intro"
  | "games"
  | "time"
  | "rank"
  | "heroes"
  | "combat"
  | "records"
  | "style"
  | "rivals"
  | "souls"
  | "survival"
  | "teamwork"
  | "sides"
  | "shop"
  | "friends"
  | "brawl"
  | "outro"
  | "share";

export interface RecapChapter {
  id: RecapChapterId;
  /** The chapter's name in the index. */
  label: string;
}

const LABELS: Record<RecapChapterId, string> = {
  intro: "Your year",
  games: "Games played",
  time: "When you played",
  rank: "Ranked journey",
  heroes: "Heroes",
  combat: "Kills and KDA",
  records: "Best games",
  style: "Play style",
  rivals: "Victims and nemeses",
  souls: "Souls",
  survival: "Survival",
  teamwork: "Teamwork",
  sides: "Sides and lanes",
  shop: "Shop",
  friends: "Friends",
  brawl: "Street Brawl",
  outro: "Summary",
  share: "Share",
};

/**
 * The chapters a recap has, in reading order: a chapter only appears when the player has data for it. Friends come
 * from other endpoints, so `hasFriends` says whether they answered with any.
 */
export function recapChapters(recap: YearRecap, { hasFriends = false } = {}): RecapChapter[] {
  const main = mainMode(recap);
  if (!main || recap.matches.length === 0) return [];
  const { totals } = main;
  // A handful of detailed matches tells no story: those chapters wait until enough are filled in.
  const detailed = hasDetails(totals);
  const damageMatrix = hasDamageMatrix(totals);
  const shown: Record<RecapChapterId, boolean> = {
    intro: true,
    games: true,
    time: true,
    rank: main.rank != null && main.rank.points.length > 0,
    heroes: main.heroes.length > 0,
    combat: totals.kills + totals.assists + totals.deaths > 0,
    records: main.records.some((record) => record.value > 0),
    style: damageMatrix && damageSplit(totals) != null,
    rivals: (damageMatrix && main.damage_targets.length > 0) || (detailed && main.killers.length > 0),
    souls: totals.souls > 0,
    survival: detailed && totals.time_dead_s > 0,
    teamwork: totals.mvp_rated_matches > 0 || (detailed && totals.player_healing + totals.teammate_healing > 0),
    sides: detailed && (main.teams.length > 0 || main.lanes.length > 0),
    shop: detailed && main.items.length > 0,
    friends: hasFriends,
    brawl: brawlMode(recap) != null,
    outro: true,
    share: true,
  };
  return (Object.keys(LABELS) as RecapChapterId[]).filter((id) => shown[id]).map((id) => ({ id, label: LABELS[id] }));
}

/** The anchor id of a chapter on the page. */
export const chapterAnchor = (id: RecapChapterId) => `recap-${id}`;
