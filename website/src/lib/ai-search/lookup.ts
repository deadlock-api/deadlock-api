import { parseSteamIdInput } from "~/lib/steam";

/** A question after one player (the tracker has their page) or one match (no page holds one). */
export type Lookup = "player" | "match";

/** Words around an ID that still make the question a lookup ("steam id 280308116", "analyze match 107857788"). */
const LOOKUP_WORDS =
  /\b(?:player|players|steam|steamid|profile|account|id|stats|match|matches|game|of|for|find|search|look ?up|analy[sz]e|show|check)\b/gi;

/**
 * A Steam ID or profile link, a match ID, or what can only be a player's name: answered without the model, since no
 * analytics page holds one player or one match. A bare number needs five digits, so "7" or "2024" are not taken for an ID; a
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

/** The player a lookup names: an account read off a Steam ID or profile link, or a name for the Steam search. */
export type PlayerLookup = { steamId3: number } | { name: string };

/** The player a question looks up, or undefined when it is not a player lookup (see `lookupOf`). */
export function playerLookupOf(question: string): PlayerLookup | undefined {
  if (lookupOf(question) !== "player") return undefined;
  const vanity = /steamcommunity\.com\/id\/([^/?#\s]+)/i.exec(question);
  if (vanity) return { name: vanity[1] };
  const parsed = parseSteamIdInput(question.replace(LOOKUP_WORDS, " ").trim());
  return "steamId3" in parsed ? { steamId3: parsed.steamId3 } : { name: question.trim() };
}

/** The match ID a match lookup names ("match 107857788"), or undefined when it is not one (see `lookupOf`). */
export function matchLookupOf(question: string): number | undefined {
  if (lookupOf(question) !== "match") return undefined;
  return Number(question.replace(LOOKUP_WORDS, " ").trim());
}

/**
 * The match a bare number could be ("107857788"), which reads as a player first: offered beside the player so either
 * opens. Undefined for anything but a lone number of five or more digits.
 */
export function bareMatchIdOf(question: string): number | undefined {
  const trimmed = question.trim();
  if (!/^\d{5,}$/.test(trimmed)) return undefined;
  const matchId = Number(trimmed);
  return Number.isSafeInteger(matchId) ? matchId : undefined;
}
