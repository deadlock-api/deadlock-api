// Heroes and items named in a question, found in code rather than by a model: exact names, the nicknames players use,
// and near misses from typos ("bebpo"), in the order the question names them.

/** Nicknames players write, by the hero or item name they stand for. */
export const ALIASES: Record<string, readonly string[]> = {
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

export interface Mention {
  name: string;
  /** Word position in the question, to keep the order it was asked in. */
  at: number;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replaceAll("&", " and ")
    .replaceAll(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Edits between two strings, a swap of two neighbouring letters ("bebpo") counting as one: the commonest typo. */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** Typos a name of this length may have and still count: none for short names, which collide with plain words. */
function allowedTypos(length: number): number {
  if (length < 5) return 0;
  return length < 9 ? 1 : 2;
}

interface Form {
  name: string;
  words: string[];
  exactOnly: boolean;
}

/** Every name a question might use for each entity: the name itself, without "the", and its nicknames. */
function formsOf(names: readonly string[]): Form[] {
  const known = new Set(names);
  const forms: Form[] = [];
  for (const name of names) {
    const own = words(name);
    forms.push({ name, words: own, exactOnly: false });
    if (own[0] === "the" && own.length > 1) forms.push({ name, words: own.slice(1), exactOnly: false });
  }
  for (const [name, aliases] of Object.entries(ALIASES)) {
    if (!known.has(name)) continue;
    for (const alias of aliases) forms.push({ name, words: words(alias), exactOnly: true });
  }
  // Longest first: "grey talon" before "talon", "extra spirit" before a hero called "Spirit".
  return forms.sort((a, b) => b.words.join(" ").length - a.words.join(" ").length);
}

/** The entities of `names` a question mentions, each once, in the order mentioned. */
export function findMentions(question: string, names: readonly string[]): Mention[] {
  const tokens = words(question);
  const taken = new Array<boolean>(tokens.length).fill(false);
  const found = new Map<string, number>();
  for (const form of formsOf(names)) {
    const size = form.words.length;
    const target = form.words.join(" ");
    for (let at = 0; at + size <= tokens.length; at++) {
      if (taken.slice(at, at + size).some(Boolean)) continue;
      const window = tokens.slice(at, at + size).join(" ");
      const typos = form.exactOnly ? 0 : allowedTypos(target.length);
      if (window === target || (typos > 0 && editDistance(window, target) <= typos)) {
        for (let i = at; i < at + size; i++) taken[i] = true;
        if (!found.has(form.name)) found.set(form.name, at);
      }
    }
  }
  return [...found].map(([name, at]) => ({ name, at })).sort((a, b) => a.at - b.at);
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
