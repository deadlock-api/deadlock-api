/** The share card's size: 1200x630, what X, Discord, Slack and LinkedIn show as a large preview. */
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;
export const LOGO = "https://deadlock-api.com/favicon.png";
export const SITE_LABEL = "deadlock-api.com/compare";

/** Relative advance of one grapheme in Inter bold, in em: wide capitals, emoji and CJK count for more. */
function glyphWidth(glyph: string): number {
  if (/\p{Extended_Pictographic}/u.test(glyph)) return 1.2;
  if (glyph.codePointAt(0)! >= 0x2e80) return 1.05;
  if (/[MW\u041c\u0428\u0429\u0416]/.test(glyph)) return 1.05;
  if (/[mw\u0436\u0448\u0449]/.test(glyph)) return 0.92;
  if (/\p{Lu}/u.test(glyph)) return 0.72;
  if (glyph === " ") return 0.28;
  return 0.6;
}

/**
 * `text` cut with an ellipsis to what `widthPx` holds at `fontSize`, measured per grapheme (emoji and accents stay
 * whole; a row of W or emoji is cut as surely as plain lowercase). Satori's own ellipsis clips unreliably.
 */
export function fitText(text: string, widthPx: number, fontSize: number): string {
  const glyphs = Array.from(new Intl.Segmenter().segment(text), (part) => part.segment);
  const widths = glyphs.map((glyph) => glyphWidth(glyph) * fontSize);
  if (widths.reduce((sum, width) => sum + width, 0) <= widthPx) return text;
  let used = fontSize * 0.9;
  let count = 0;
  while (count < glyphs.length && used + widths[count] <= widthPx) used += widths[count++];
  return `${glyphs.slice(0, Math.max(1, count)).join("").trimEnd()}…`;
}

/**
 * `text` split where `widthPx` runs out at `fontSize`, between graphemes: the head fills the first line, the rest goes
 * on the next. For a name with no space where it could break ("xXDeadlockGodXx"), rather than losing its end.
 */
export function breakAtWidth(text: string, widthPx: number, fontSize: number): [string, string] {
  const glyphs = Array.from(new Intl.Segmenter().segment(text), (part) => part.segment);
  let used = 0;
  let count = 0;
  while (count < glyphs.length && used + glyphWidth(glyphs[count]) * fontSize <= widthPx) {
    used += glyphWidth(glyphs[count]) * fontSize;
    count += 1;
  }
  const head = Math.max(1, count);
  return [glyphs.slice(0, head).join("").trimEnd(), glyphs.slice(head).join("").trimStart()];
}
