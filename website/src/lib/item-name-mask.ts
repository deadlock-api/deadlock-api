import type { Upgrade } from "deadlock_api_client";

const MASK = "???";
const MIN_WORD_LENGTH = 3;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A tooltip `loc_string` as plain text: inline icons and tags dropped. */
export function locStringText(html: string): string {
  return html.replace(/<svg[\s\S]*?<\/svg>/gi, "").replace(/<[^>]*>/g, "");
}

function descriptionText(item: Upgrade): string {
  return (item.tooltip_sections ?? [])
    .flatMap((section) => section.section_attributes ?? [])
    .map((attr) => (attr.loc_string ? locStringText(attr.loc_string.replace(/<br\s*\/?>/gi, " ")) : ""))
    .join(" ");
}

function wordPattern(word: string, flags = "i"): RegExp {
  return new RegExp(`\\b${escapeRegExp(word)}\\b`, flags);
}

/**
 * The words of each item's name that give it away in its own description: words no other item's description uses
 * ("carpet" in Magic Carpet's "dismiss the carpet"). Shared game terms like "Spirit" or "Bullets" stay readable, they
 * are the clues. Keyed by item id.
 */
export function giveawayNameWords(items: readonly Upgrade[]): Map<number, string[]> {
  const texts = items.map((item) => ({ id: item.id, text: descriptionText(item) }));
  const result = new Map<number, string[]>();
  for (const item of items) {
    const own = descriptionText(item).replace(new RegExp(escapeRegExp(item.name), "gi"), MASK);
    const words = (item.name.match(/[\p{L}']+/gu) ?? []).filter((word) => {
      if (word.length < MIN_WORD_LENGTH) return false;
      const pattern = wordPattern(word);
      return pattern.test(own) && !texts.some((other) => other.id !== item.id && pattern.test(other.text));
    });
    if (words.length > 0) result.set(item.id, words);
  }
  return result;
}

/** Replaces the full name, then each whole word in `words`, with "???". */
export function maskName(text: string, name: string, words: readonly string[] = []): string {
  let masked = text.replace(new RegExp(escapeRegExp(name), "gi"), MASK);
  for (const word of words) masked = masked.replace(wordPattern(word, "gi"), MASK);
  return masked;
}
