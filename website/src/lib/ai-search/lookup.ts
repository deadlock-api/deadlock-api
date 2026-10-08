import { parseSteamIdInput } from "~/lib/steam";

/** A question after one player or one match, which the site has no page for. */
export type Lookup = "player" | "match";

/** Words around an ID that still make the question a lookup ("steam id 280308116", "analyze match 107857788"). */
const LOOKUP_WORDS =
  /\b(?:player|players|steam|steamid|profile|account|id|stats|match|matches|game|of|for|find|search|look ?up|analy[sz]e|show|check)\b/gi;

/**
 * A Steam ID or profile link, a match ID, or what can only be a player's name: answered without the model, since no
 * page holds one player or one match. A bare number needs five digits, so "7" or "2024" are not taken for an ID; a
 * name is one word of five or more characters with a digit or an underscore ("CnuHHep_2340"), so "t3" or "1v1" are not.
 * Run it after the hero and item names had their chance.
 */
export function lookupOf(question: string): Lookup | undefined {
  if (/steamcommunity\.com\/(?:id|profiles)\//i.test(question)) return "player";
  const rest = question.replace(LOOKUP_WORDS, " ").trim();
  if (/\bmatch(?:es)?\b/i.test(question)) return /^\d{5,}$/.test(rest) ? "match" : undefined;
  if (/^\d{1,4}$/.test(rest)) return undefined;
  if ("steamId3" in parseSteamIdInput(rest)) return "player";
  return /^(?=\S*[a-z])(?=\S*[\d_])\S{5,}$/i.test(question.trim()) ? "player" : undefined;
}
