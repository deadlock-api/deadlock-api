const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Words of a name too common to give it away when they appear alone. */
const COMMON_WORDS = new Set(["the", "and", "of", "a", "an"]);

/**
 * `text` with the answer's name hidden, for a hint: the full name ("Mo & Krill" also as "Mo and Krill") and each
 * distinctive word of it, so lore that says "Lady Jeanne Geist" or "the humble Doorman" does not name the hero.
 */
export function redactName(text: string, name: string, mask = "???"): string {
  const variants = [name, name.replace(/\s*&\s*/g, " and ")].map(escape);
  const words = name
    .split(/[^\p{L}\p{N}']+/u)
    .filter((word) => word.length >= 3 && !COMMON_WORDS.has(word.toLowerCase()))
    .map(escape);
  let out = text.replace(new RegExp(variants.join("|"), "gi"), mask);
  if (words.length > 0) out = out.replace(new RegExp(`\\b(?:${words.join("|")})\\b`, "gi"), mask);
  return out;
}
