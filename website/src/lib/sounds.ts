/**
 * The sound index (`/v1/assets/sounds`) is a file tree: folders are objects, files map their name to a CDN URL. These
 * helpers turn it into what the sound browser lists: takes of one line grouped together, voice lines per character,
 * and the match-start conversations stitched back together from the speakers' folders.
 */

import { capitalize } from "~/lib/format";

export type SoundTree = { [name: string]: string | SoundTree };

export interface SoundTake {
  /** The file name without extension, which is how the game names it. */
  name: string;
  url: string;
}

/** One line or effect and all its recorded takes (`kill_trapper_01` … `_05`). */
export interface SoundGroup {
  /** Unique within the list it belongs to. */
  id: string;
  label: string;
  /** The label's words as the file name spells them (`ally_hornet_killed_in_lane`), for `groupTopics`. */
  words: string;
  /** The folder below the list's root, empty at the root. */
  folder: string;
  takes: SoundTake[];
}

/** Trailing take numbers and alternates: `_01`, `-003`, `_alt_01`, `_01_alt_02`. */
const TAKE_SUFFIX = /(?:[_-](?:alt|\d+))+$/;
const CONVO = /^(.*?_convo(\d+))(?:_(\d+))?(.*)$/;

/** Folders of the index that are no use to a reader: test tones, silence, placeholders. */
const HIDDEN_CATEGORIES = new Set(["vo", "test", "util", "common"]);

export function isSoundTree(value: unknown): value is SoundTree {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every file below `tree`, with the folders leading to it. */
export function flattenSounds(tree: SoundTree, path: string[] = []): { path: string[]; take: SoundTake }[] {
  const out: { path: string[]; take: SoundTake }[] = [];
  // One list filled in place: spreading each folder's files into its parent's copied them once per level, and a
  // spread of tens of thousands of arguments can overflow the stack.
  const visit = (folder: SoundTree, at: string[]) => {
    for (const [name, value] of Object.entries(folder)) {
      if (typeof value === "string") out.push({ path: at, take: { name, url: value } });
      else if (isSoundTree(value)) visit(value, [...at, name]);
    }
  };
  visit(tree, path);
  return out;
}

export function countSounds(tree: SoundTree): number {
  let count = 0;
  for (const value of Object.values(tree)) {
    if (typeof value === "string") count += 1;
    else if (isSoundTree(value)) count += countSounds(value);
  }
  return count;
}

/** `astro_kill_trapper_03` -> `astro_kill_trapper`. A name that is only a number keeps it. */
export function takeBase(name: string): string {
  const base = name.replace(TAKE_SUFFIX, "");
  return base === "" ? name : base;
}

/**
 * Words of a file name for reading. `names` maps codenames to display names (`hornet` -> Vindicta), so a voice line
 * about a hero names the hero as players know it.
 */
export function humanizeSoundName(name: string, names?: ReadonlyMap<string, string>): string {
  const words = name
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((word) => names?.get(word.toLowerCase()) ?? word.toLowerCase());
  return capitalize(words.join(" "));
}

/**
 * The leading `_` words most names of a folder share (at least 4 in 5), such as the hero's codename or `ping`. A few
 * files of a folder are named otherwise, so requiring every name to share them would keep the prefix on all of them.
 */
function sharedPrefix(names: string[]): string[] {
  if (names.length < 2) return [];
  const split = names.map((name) => name.split("_"));
  const prefix: string[] = [];
  for (;;) {
    const depth = prefix.length;
    const counts = new Map<string, number>();
    for (const words of split) {
      if (words.length <= depth + 1 || prefix.some((word, i) => words[i] !== word)) continue;
      counts.set(words[depth], (counts.get(words[depth]) ?? 0) + 1);
    }
    const [word, count] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
    if (count < names.length * 0.8) return prefix;
    prefix.push(word);
  }
}

function withoutPrefix(name: string, prefix: string[]): string {
  const words = name.split("_");
  const shared = prefix.every((word, i) => words[i] === word) && words.length > prefix.length;
  return shared ? words.slice(prefix.length).join("_") : name;
}

/**
 * Groups takes of the same line within each folder. Within a folder, the words most lines start with (the hero's
 * codename, `ping`, `patron_female`) are dropped from the labels, since the folder already says them.
 */
export function groupTakes(
  files: { path: string[]; take: SoundTake }[],
  names?: ReadonlyMap<string, string>,
  /** Words dropped from the start of a label: a speaker's codename and name (Abrams' files say `atlas_` or `abrams_`). */
  speakerWords?: ReadonlySet<string>,
): SoundGroup[] {
  const byFolder = new Map<string, Map<string, SoundTake[]>>();
  for (const { path, take } of files) {
    const folder = path.join("/");
    let groups = byFolder.get(folder);
    if (!groups) {
      groups = new Map();
      byFolder.set(folder, groups);
    }
    const base = takeBase(take.name);
    const takes = groups.get(base);
    if (takes) takes.push(take);
    else groups.set(base, [take]);
  }
  const out: SoundGroup[] = [];
  for (const [folder, groups] of byFolder) {
    const bases = [...groups.keys()];
    const unspoken = (base: string) => {
      const [first, ...rest] = base.split("_");
      return speakerWords?.has(first) && rest.length > 0 ? rest.join("_") : base;
    };
    const prefix = sharedPrefix(bases.map(unspoken));
    // Lines recorded under two names (Abrams' `atlas_…` and `abrams_…`) are one line once the speaker is dropped.
    const byWords = new Map<string, { base: string; takes: SoundTake[] }>();
    for (const base of bases.sort()) {
      const words = withoutPrefix(unspoken(base), prefix);
      const takes = groups.get(base) ?? [];
      const same = byWords.get(words);
      if (same) same.takes.push(...takes);
      else byWords.set(words, { base, takes: [...takes] });
    }
    for (const [words, { base, takes }] of byWords) {
      takes.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
      out.push({
        id: folder ? `${folder}/${base}` : base,
        label: humanizeSoundName(words, names),
        words,
        folder,
        takes,
      });
    }
  }
  return out;
}

export function isConversationLine(name: string): boolean {
  return CONVO.test(name);
}

/** The sound categories worth browsing, in the index's order. */
export function effectCategories(index: SoundTree): string[] {
  return Object.keys(index).filter((key) => !HIDDEN_CATEGORIES.has(key) && isSoundTree(index[key]));
}

export interface ConversationLine {
  /** The voice folder of whoever says it. */
  speaker: string;
  /** Its place in the conversation; lines without a number come first. */
  order: number;
  takes: SoundTake[];
}

export interface Conversation {
  id: string;
  /** Who talks, as the file names say it: "Abrams Bebop", "Dynamo oathkeeper". */
  label: string;
  /** When it plays, if the file names say: "Match start". */
  context: string;
  /** Which conversation of the pairing it is (`convo02` -> 2). */
  part: number;
  speakers: string[];
  lines: ConversationLine[];
}

/**
 * Conversations are recorded as one file per line in each speaker's folder (`astro/astro_match_start_astro_chrono_
 * convo01_02`, `chrono/chrono_match_start_astro_chrono_convo01_01`); this puts them back together in order. A line
 * recorded twice (`_02_02`, `_02_alt_01`) is one line with two takes. Lines whose partner was never recorded (Abrams'
 * half of `abrams_bebop_convo01`) are left out: a conversation has at least two speakers.
 */
export function buildConversations(vo: SoundTree, names?: ReadonlyMap<string, string>): Conversation[] {
  const byId = new Map<string, { part: number; lines: Map<string, ConversationLine> }>();
  for (const { path, take } of flattenSounds(vo)) {
    const speaker = path[0];
    if (!speaker) continue;
    const match = CONVO.exec(take.name);
    if (!match) continue;
    const id = match[1].startsWith(`${speaker}_`) ? match[1].slice(speaker.length + 1) : match[1];
    const order = match[3] ? Number(match[3]) : 0;
    let convo = byId.get(id);
    if (!convo) {
      convo = { part: Number(match[2]), lines: new Map() };
      byId.set(id, convo);
    }
    const key = `${order}:${speaker}`;
    const line = convo.lines.get(key);
    if (line) line.takes.push(take);
    else convo.lines.set(key, { speaker, order, takes: [take] });
  }
  const out: Conversation[] = [];
  for (const [id, { part, lines }] of byId) {
    if (new Set([...lines.values()].map((line) => line.speaker)).size < 2) continue;
    const sorted = [...lines.values()].sort((a, b) => a.order - b.order || a.speaker.localeCompare(b.speaker));
    for (const line of sorted) line.takes.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
    out.push({
      id,
      label: humanizeSoundName(id.replace(/_convo\d+$/, "").replace(/^match_start_/, ""), names),
      context: id.startsWith("match_start_") ? "Match start" : "",
      part,
      speakers: [...new Set(sorted.map((line) => line.speaker))],
      lines: sorted,
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label) || a.part - b.part);
}

export interface VoiceSection {
  /** The subfolder (`ping`, `emote`, `female_patron`), or `lines` for the folder's own files. */
  id: string;
  groups: SoundGroup[];
}

/**
 * One character's voice lines by subfolder, conversations left out (they have their own view). `speakerWords` are
 * the character's codename and name, which start most of its file names and are dropped from the labels.
 */
export function voiceSections(
  tree: SoundTree,
  names?: ReadonlyMap<string, string>,
  speakerWords?: ReadonlySet<string>,
): VoiceSection[] {
  const bySection = new Map<string, { path: string[]; take: SoundTake }[]>();
  for (const file of flattenSounds(tree)) {
    if (isConversationLine(file.take.name)) continue;
    const id = file.path[0] ?? "lines";
    const files = bySection.get(id);
    if (files) files.push(file);
    else bySection.set(id, [file]);
  }
  return [...bySection]
    .sort(([a], [b]) => (a === "lines" ? -1 : b === "lines" ? 1 : a.localeCompare(b)))
    .map(([id, files]) => ({ id, groups: groupTakes(files, names, speakerWords) }));
}

/** Case-insensitive match of every word of `query` against a label and its file names. */
export function matchesSoundQuery(query: string, label: string, takes: SoundTake[], extra = ""): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${label} ${extra} ${takes.map((take) => take.name).join(" ")}`.toLowerCase().replaceAll("_", " ");
  return words.every((word) => haystack.includes(word));
}

export interface SoundTopicRow {
  group: SoundGroup;
  /** The row's name within its topic: the hero it is about, or the words after the topic's own. */
  label: string;
  /** The codename of the hero the line is about, in a topic of one line said about many heroes. */
  subject?: string;
}

export interface SoundTopic {
  id: string;
  label: string;
  folder: string;
  rows: SoundTopicRow[];
}

/** Words too common to name a hero on their own, though they are part of a hero's name. */
const SHORT_NAME_WORD = 5;

/**
 * Finds hero mentions in the words of a file name: a codename (`hornet`), a name (`vindicta`, `rat_king`,
 * `ratking`), or a distinctive word of a longer name (`geist`, `talon`). Returns the first, longest mention.
 */
export function heroMentionFinder(heroes: readonly { codename: string; name: string }[]) {
  const phrases = new Map<string, string>();
  const wordCounts = new Map<string, number>();
  for (const { name } of heroes) {
    for (const word of name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)) {
      wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
    }
  }
  for (const { codename, name } of heroes) {
    const words = name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    phrases.set(codename, codename);
    phrases.set(words.join("_"), codename);
    phrases.set(words.join(""), codename);
    if (words.length > 1) {
      for (const word of words) {
        if (word.length >= SHORT_NAME_WORD && wordCounts.get(word) === 1 && !phrases.has(word))
          phrases.set(word, codename);
      }
    }
  }
  return (words: string[]): { start: number; length: number; codename: string } | null => {
    for (let start = 0; start < words.length; start += 1) {
      for (let length = Math.min(3, words.length - start); length > 0; length -= 1) {
        const codename = phrases.get(words.slice(start, start + length).join("_"));
        if (codename) return { start, length, codename };
      }
    }
    return null;
  };
}

/**
 * Sorts lines into topics without a list of topics. Lines that read the same but for one word form a topic, with
 * that word as the row: "ally Mina killed in lane", "ally Fairfax killed in lane" are "Ally … killed in lane" with the
 * rows Mina and Fairfax. A word that names a hero (`findHero`) is the row's hero, two mentions of one hero (`nano`,
 * `calico`) are one row, and such a topic needs only two lines; a topic of other words needs `minShared`. Lines left
 * over are "Other".
 */
export function groupTopics(
  groups: readonly SoundGroup[],
  {
    findHero,
    heroName,
    minShared = 3,
  }: {
    findHero: ReturnType<typeof heroMentionFinder>;
    heroName: (codename: string) => string;
    minShared?: number;
  },
): SoundTopic[] {
  interface Candidate {
    folder: string;
    words: string[];
    /** By the hole's word (or hero), with the lines that fill it. */
    rows: Map<string, { row: SoundTopicRow; sources: SoundGroup[] }>;
  }
  const candidates = new Map<string, Candidate>();
  const addRow = (key: string, folder: string, words: string[], rowKey: string, row: SoundTopicRow) => {
    let candidate = candidates.get(key);
    if (!candidate) {
      candidate = { folder, words, rows: new Map() };
      candidates.set(key, candidate);
    }
    const same = candidate.rows.get(rowKey);
    if (same) {
      same.row = { ...same.row, group: { ...same.row.group, takes: [...same.row.group.takes, ...row.group.takes] } };
      same.sources.push(row.group);
    } else {
      candidate.rows.set(rowKey, { row, sources: [row.group] });
    }
  };

  // Every way a line can be read as a template with one hole: at a hero mention, or at any single word.
  for (const group of groups) {
    const words = group.words.split("_").filter(Boolean);
    const mention = findHero(words);
    if (mention) {
      const template = [...words.slice(0, mention.start), "*", ...words.slice(mention.start + mention.length)];
      const key = `${group.folder}|${template.join("_")}`;
      addRow(key, group.folder, template, mention.codename, {
        group,
        label: heroName(mention.codename),
        subject: mention.codename,
      });
    }
    if (words.length > 1) {
      for (let i = 0; i < words.length; i += 1) {
        if (mention && i >= mention.start && i < mention.start + mention.length) continue;
        const template = words.map((word, j) => (j === i ? "*" : word));
        const key = `${group.folder}|${template.join("_")}`;
        addRow(key, group.folder, template, words[i], { group, label: humanizeSoundName(words[i]) });
      }
    }
  }

  // The biggest templates claim their lines first; a template keeps only the lines no bigger one took.
  const heroRows = (candidate: Candidate) => [...candidate.rows.values()].filter(({ row }) => row.subject).length;
  const order = [...candidates].sort(([, a], [, b]) => b.rows.size - a.rows.size || heroRows(b) - heroRows(a));
  const claimed = new Set<SoundGroup>();
  const topics: SoundTopic[] = [];
  for (const [key, candidate] of order) {
    const free = [...candidate.rows.values()].filter(({ sources }) => sources.every((g) => !claimed.has(g)));
    const aboutHeroes = free.length >= 2 && free.every(({ row }) => row.subject);
    if (free.length < minShared && !aboutHeroes) continue;
    for (const { sources } of free) for (const g of sources) claimed.add(g);
    topics.push({
      id: key,
      label: humanizeSoundName(candidate.words.map((word) => (word === "*" ? "…" : word)).join("_")),
      folder: candidate.folder,
      rows: free.map(({ row }) => row).sort((a, b) => a.label.localeCompare(b.label)),
    });
  }

  const folderOrder = [...new Set(groups.map((group) => group.folder))];
  topics.sort(
    (a, b) => folderOrder.indexOf(a.folder) - folderOrder.indexOf(b.folder) || a.label.localeCompare(b.label),
  );
  for (const folder of folderOrder) {
    // One-off lines that start alike ("ally Bebop far hook", "ally Haze big ult") still share their first word.
    const byFirst = new Map<string, SoundGroup[]>();
    for (const group of groups) {
      if (group.folder !== folder || claimed.has(group)) continue;
      const first = group.words.split("_")[0];
      const shared = byFirst.get(first);
      if (shared) shared.push(group);
      else byFirst.set(first, [group]);
    }
    for (const [first, shared] of byFirst) {
      if (shared.length < minShared || shared.every((group) => group.words === first)) continue;
      for (const group of shared) claimed.add(group);
      const rows = shared.map((group) => ({
        group,
        label: humanizeSoundName(group.label.split(" ").slice(1).join(" ")) || group.label,
      }));
      // "kill …" may already be a topic of two-word lines ("kill Haze"); the longer ones join it.
      const id = `${folder}|${first}_*`;
      const existing = topics.find((topic) => topic.id === id);
      if (existing) existing.rows = [...existing.rows, ...rows].sort((a, b) => a.label.localeCompare(b.label));
      else
        topics.push({
          id,
          label: `${humanizeSoundName(first)} …`,
          folder,
          rows: rows.sort((a, b) => a.label.localeCompare(b.label)),
        });
    }
  }
  topics.sort(
    (a, b) => folderOrder.indexOf(a.folder) - folderOrder.indexOf(b.folder) || a.label.localeCompare(b.label),
  );
  for (const folder of folderOrder) {
    const rows = groups
      .filter((group) => group.folder === folder && !claimed.has(group))
      .map((group) => ({ group, label: group.label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    if (rows.length === 0) continue;
    const at = topics.findLastIndex((topic) => topic.folder === folder) + 1;
    topics.splice(at === 0 ? topics.length : at, 0, { id: `${folder}|*other`, label: "Other", folder, rows });
  }
  return topics;
}
