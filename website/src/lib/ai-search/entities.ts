import { editDistance } from "~/lib/slug";

// Heroes and items named in a question, found in code rather than by a model: exact names, the nicknames players use,
// and near misses from typos ("bebpo"), in the order the question names them.

/** Nicknames players write, by the hero or item name they stand for. */
const ALIASES: Record<string, readonly string[]> = {
  "Mo & Krill": ["mo krill", "mo", "krill", "mnk"],
  "Grey Talon": ["gt", "talon", "gray talon"],
  "Lady Geist": ["geist", "lady g", "lg"],
  "The Doorman": ["doorman"],
  McGinnis: ["mcg", "mcginnis", "ginnis"],
  "Rat King": ["ratking"],
  Vindicta: ["vin", "vindi"],
  Infernus: ["inf"],
  Viscous: ["visc", "goo"],
  Paradox: ["dox"],
  Holliday: ["holiday"],
  "Toxic Bullets": ["toxic"],
  Unstoppable: ["unstop"],
};

interface Mention {
  name: string;
  /** Word position in the question, to keep the order it was asked in. */
  at: number;
  /** How many of the question's words it took. */
  length: number;
}

/** A question's words, the way names are compared: lowercase, "&" as "and", no apostrophes or punctuation. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replaceAll("&", " and ")
    .replaceAll(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Typos a name of this length may have and still count: none for short names, which collide with plain words. */
function allowedTypos(length: number): number {
  if (length < 5) return 0;
  return length < 9 ? 1 : 2;
}

interface Form {
  name: string;
  words: string[];
  target: string;
  typos: number;
}

/**
 * Every name a question might use for each entity: the name itself, without "the", and its nicknames (exact only).
 * Longest first: "grey talon" before "talon".
 */
function formsOf(names: readonly string[]): Form[] {
  const form = (name: string, own: string[], exact: boolean): Form => {
    const target = own.join(" ");
    return { name, words: own, target, typos: exact ? 0 : allowedTypos(target.length) };
  };
  const known = new Set(names);
  const forms: Form[] = [];
  for (const name of names) {
    const own = words(name);
    forms.push(form(name, own, false));
    if (own[0] === "the" && own.length > 1) forms.push(form(name, own.slice(1), false));
  }
  for (const [name, aliases] of Object.entries(ALIASES)) {
    if (known.has(name)) for (const alias of aliases) forms.push(form(name, words(alias), true));
  }
  return forms.sort((a, b) => b.target.length - a.target.length);
}

/** The entities of `names` a question mentions, each once, in the order mentioned. */
export function findMentions(question: string, names: readonly string[]): Mention[] {
  const tokens = words(question);
  const taken = new Array<boolean>(tokens.length).fill(false);
  const found = new Map<string, Mention>();
  for (const form of formsOf(names)) {
    const size = form.words.length;
    for (let at = 0; at + size <= tokens.length; at++) {
      if (taken.slice(at, at + size).some(Boolean)) continue;
      const window = tokens.slice(at, at + size).join(" ");
      const close =
        window === form.target ||
        (form.typos > 0 &&
          Math.abs(window.length - form.target.length) <= form.typos &&
          editDistance(window, form.target) <= form.typos);
      if (!close) continue;
      for (let i = at; i < at + size; i++) taken[i] = true;
      if (!found.has(form.name)) found.set(form.name, { name: form.name, at, length: size });
    }
  }
  return [...found.values()].sort((a, b) => a.at - b.at);
}

const TIER_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };

/**
 * The shop tiers a question names, ascending: "t1", "tier 2", "tier one", "t3/t4", "tier 1 and 2". "tier list" and
 * "s tier" name no shop tier.
 */
export function itemTiersOf(question: string): number[] {
  const tiers = new Set<number>();
  const tokens = words(question);
  const tierOf = (token: string | undefined) => (token ? (TIER_NUMBERS[token] ?? Number(token)) : NaN);
  const isTier = (tier: number) => Number.isInteger(tier) && tier >= 1 && tier <= 4;
  tokens.forEach((token, i) => {
    const short = /^t([1-4])$/.exec(token);
    if (short) tiers.add(Number(short[1]));
    if (token !== "tier" && token !== "tiers") return;
    // "tier 1", and the numbers that follow it: "tier 1 and 2", "tiers 3 4".
    for (let at = i + 1; at < tokens.length; at++) {
      const tier = tierOf(tokens[at]);
      if (isTier(tier)) tiers.add(tier);
      else if (tokens[at] !== "and" && tokens[at] !== "or") break;
    }
  });
  return [...tiers].sort((a, b) => a - b);
}

const VERSUS = new Set(["vs", "versus", "against", "v"]);

/**
 * The heroes a question names, split into two teams at its first "vs" or "against" ("seven wraith vs abrams"). A
 * question without one has a single team.
 */
export function heroTeams(question: string, heroNames: readonly string[]): { heroes: string[]; enemies: string[] } {
  const mentions = findMentions(question, heroNames);
  const split = words(question).findIndex((word) => VERSUS.has(word));
  if (split < 0) return { heroes: mentions.map((m) => m.name), enemies: [] };
  return {
    heroes: mentions.filter((m) => m.at < split).map((m) => m.name),
    enemies: mentions.filter((m) => m.at > split).map((m) => m.name),
  };
}
