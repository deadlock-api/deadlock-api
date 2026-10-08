import type { Region, SelectionMode, SelectionTime, SortKey } from "~/lib/page-registry";

import { findMentions } from "./entities";

// What the search decides for a question: not an answer to it, but which pages hold the answer and what to open them
// with, by name. `resolve.ts` turns it into URLs.

/** How many pages the search offers for one question. */
export const MAX_PAGES = 3;

export interface SearchIntent {
  /** Registered page ids, best first. */
  pages: string[];
  /** The heroes the question is about; on the team builder, the asker's own team. */
  heroes: string[];
  /** Only the team builder reads it: the other team. */
  enemy_heroes: string[];
  items: string[];
  /** Rank tier names ("Phantom"), each end optional. */
  rank_min: string | null;
  rank_max: string | null;
  mode: SelectionMode | null;
  time: SelectionTime | null;
  region: Region | null;
  sort: SortKey | null;
}

/** An intent with nothing narrowed: every filter at the page's default. */
export const NO_FILTERS: Omit<SearchIntent, "pages"> = {
  heroes: [],
  enemy_heroes: [],
  items: [],
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

/**
 * A question that is just a hero's or an item's name goes to that entity's pages without asking the model: the
 * answer is certain and instant.
 */
export function directIntent(question: string, vocabulary: IntentVocabulary): SearchIntent | undefined {
  const words = question.trim().split(/\s+/).length;
  const [hero] = findMentions(question, vocabulary.heroNames);
  if (hero && words <= hero.name.split(" ").length) {
    return { ...NO_FILTERS, pages: ["hero_page", "hero_counters", "build_flow"], heroes: [hero.name] };
  }
  const [item] = findMentions(question, vocabulary.itemNames);
  if (item && words <= item.name.split(" ").length) {
    return { ...NO_FILTERS, pages: ["item_page", "item_timing", "item_stats"], items: [item.name] };
  }
  return undefined;
}
