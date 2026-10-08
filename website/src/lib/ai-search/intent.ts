import type { Region, SelectionMode, SelectionTime, SortKey } from "~/lib/page-registry";

import { findMentions, words } from "./entities";

// What the search decides for a question: not an answer to it, but which page holds the answer and what to open it
// with, by name. `resolve.ts` turns it into a URL.

export interface SearchIntent {
  /** The registered page id, or null for a question the search could not place. */
  page: string | null;
  /** The heroes the question is about; on a page with two sides, the asker's own. */
  heroes: string[];
  /** Only a page with two sides reads it: the other team. */
  enemy_heroes: string[];
  items: string[];
  /** Shop tiers, 1 to 4 ("t1 items"). */
  item_tiers: number[];
  /** Rank tier names ("Phantom"), each end optional. */
  rank_min: string | null;
  rank_max: string | null;
  mode: SelectionMode | null;
  time: SelectionTime | null;
  region: Region | null;
  sort: SortKey | null;
}

/** An intent with nothing narrowed: every filter at the page's default. */
export const NO_FILTERS: Omit<SearchIntent, "page"> = {
  heroes: [],
  enemy_heroes: [],
  items: [],
  item_tiers: [],
  rank_min: null,
  rank_max: null,
  mode: null,
  time: null,
  region: null,
  sort: null,
};

export interface IntentVocabulary {
  heroNames: readonly string[];
  itemNames: readonly string[];
  rankNames: readonly string[];
}

/** The one entity a question consists of, word for word ("gt", "toxic bullets"), if it is nothing else. */
function onlyMention(question: string, names: readonly string[]): string | undefined {
  const mentions = findMentions(question, names);
  const [mention] = mentions;
  return mentions.length === 1 && mention.at === 0 && mention.length === words(question).length
    ? mention.name
    : undefined;
}

/**
 * A question that is just a hero's or an item's name goes to that entity's page without asking the model: the answer
 * is certain and instant.
 */
export function directIntent(question: string, vocabulary: IntentVocabulary): SearchIntent | undefined {
  const hero = onlyMention(question, vocabulary.heroNames);
  if (hero) return { ...NO_FILTERS, page: "hero_page", heroes: [hero] };
  const item = onlyMention(question, vocabulary.itemNames);
  if (item) return { ...NO_FILTERS, page: "item_page", items: [item] };
  return undefined;
}
