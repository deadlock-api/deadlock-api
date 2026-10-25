import { EPOCH_DATE } from "./seed";

// Who each day's puzzle is drawn from. A pick indexes into its pool, so a hero or item joining the live asset list
// moved the answer of every earlier day; instead each day draws from the roster it had, in the order it had it.
//
// An id joins on the UTC day after the build that added it: builds go live in the US afternoon, late in the UTC day, so
// a release day keeps the answer most of it was played with. Every other id was in the pool on day 1. An id missing
// from its list is in no pool: a new hero or item comes up only once it is added here, with its date.

/** The heroes of Guess the Hero, Guess the Ability, Guess the Sound, Higher or Lower and Trivia, by id. */
const HERO_IDS = [
  1, // Infernus
  2, // Seven
  3, // Vindicta
  4, // Lady Geist
  6, // Abrams
  7, // Wraith
  8, // McGinnis
  10, // Paradox
  11, // Dynamo
  12, // Kelvin
  13, // Haze
  14, // Holliday
  15, // Bebop
  16, // Calico
  17, // Grey Talon
  18, // Mo & Krill
  19, // Shiv
  20, // Ivy
  25, // Warden
  27, // Yamato
  31, // Lash
  35, // Viscous
  50, // Pocket
  52, // Mirage
  58, // Vyper
  60, // Sinclair
  63, // Mina
  64, // Drifter
  65, // Venator
  66, // Victor
  67, // Paige
  69, // The Doorman
  72, // Billy
  76, // Graves
  77, // Apollo
  78, // Deadman Danny
  79, // Rem
  80, // Silver
  81, // Celeste
  84, // Rat King
  85, // Solomon
  86, // Violet
  87, // Nurse Harrow
  88, // Baba
];

/** The first puzzle day of each hero released after day 1 (build in the comment). */
const HEROES_ADDED: Readonly<Record<number, string>> = {
  79: "2026-10-03", // Rem, 6737
  84: "2026-10-03", // Rat King, 6737
  88: "2026-10-07", // Baba, 6757
  85: "2026-10-10", // Solomon, 6769
  78: "2026-10-14", // Deadman Danny, 6779
  86: "2026-10-17", // Violet, 6790
  87: "2026-10-21", // Nurse Harrow, 6801
};

/** The shop items of Guess the Item, Item Stats and Trivia, in the order of the asset list. */
const ITEM_IDS = [
  1548066885, 1009965641, 709540378, 811521119, 710436191, 2678489038, 2064029594, 3077079169, 1437614329, 4204808176,
  1414025773, 3791587546, 1342610602, 3331811235, 393974127, 2037039379, 1144549437, 2108215830, 619484391, 1113837674,
  1414319208, 339443430, 1282141666, 2010028405, 1770441818, 2152872419, 4053935515, 4075861416, 3884003354, 395867183,
  1396247347, 2095565695, 3696726732, 2480592370, 3633614685, 499683006, 1047818222, 3731635960, 2163598980, 3140772621,
  1378931225, 2566692615, 3585132399, 865846625, 3399065363, 3074274290, 2447176615, 334300056, 668299740, 4139877411,
  2481177645, 1672893796, 805079544, 112198670, 1235347618, 3970837787, 968099481, 1439347412, 7409189, 2226497419,
  3361075077, 1193964439, 754480263, 3776945997, 876563814, 2971868509, 3577481646, 1998374645, 2121044373, 2081037738,
  2603935618, 1102081447, 3005970438, 787198704, 424779525, 380806748, 3261353684, 915014646, 1813726886, 1219329868,
  2142980412, 2922054143, 2061878743, 1804594021, 3144988365, 2417568017, 1254091416, 1371725689, 3270001687,
  1152158042, 677738769, 630839635, 395944548, 3361811174, 1798666702, 600033864, 2956256701, 2059712766, 1710079648,
  4121584236, 1797283378, 857669956, 1662311306, 1932939246, 989206714, 3403085434, 3977876567, 1150006784, 3357231760,
  2407781327, 1976391348, 3812615317, 2533252781, 2617435668, 2951612397, 2717651715, 365620721, 1409190604, 1055679805,
  1252627263, 465043967, 3190916303, 26002154, 800008313, 2820116164, 2947183272, 2519598785, 2739107182, 2829638276,
  1292979587, 1925087134, 84321454, 3919289022, 2407033488, 2463960640, 4104549924, 865958998, 1644605047, 951866250,
  3862866912, 2356412290, 3647584222, 381961617, 2800629741, 343572757, 493591231, 3028234315, 1427630806, 673001892,
  3269957497, 3491236900, 1955841979, 1250307611, 2221211450, 98582110, 690458959, 1736094134, 2054088113, 3949773228,
  3729138568, 230297145, 4050602737, 3568217437, 3523480953, 64550694, 1825399334, 1132564516, 1558545403, 2068250483,
  2319629810, 3294954488, 1763073141, 2462046703,
];

/** The first puzzle day of each item added after day 1 (build in the comment). */
const ITEMS_ADDED: Readonly<Record<number, string>> = {
  951866250: "2026-05-01", // Indomitable, 6468
  1672893796: "2026-05-23", // Grit, 6514
};

/** Names a game saved before a rename still holds, lowercased, to the name the asset list has now. */
const RENAMED: ReadonlyMap<string, string> = new Map([
  ["spirit shredder bullets", "Spirit Shredder"], // 6712
  ["armor piercing rounds", "Armor Piercer"], // 6712
]);

function poolOn<T extends { id: number }>(
  entries: readonly T[],
  ids: readonly number[],
  added: Readonly<Record<number, string>>,
  date: string,
): T[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return ids.flatMap((id) => {
    const entry = byId.get(id);
    return entry && (added[id] ?? EPOCH_DATE) <= date ? [entry] : [];
  });
}

/** The heroes `date`'s puzzles draw from, out of the full hero list. */
export function heroPoolOn<T extends { id: number }>(heroes: readonly T[], date: string): T[] {
  return poolOn(heroes, HERO_IDS, HEROES_ADDED, date);
}

/** The shop items `date`'s puzzles draw from, out of the full item list. */
export function itemPoolOn<T extends { id: number }>(items: readonly T[], date: string): T[] {
  return poolOn(items, ITEM_IDS, ITEMS_ADDED, date);
}

/** A saved guess under the name its answer has now. */
export function currentName(name: string): string {
  return RENAMED.get(name.toLowerCase()) ?? name;
}
