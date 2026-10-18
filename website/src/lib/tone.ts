/** The meaning a number carries when it is compared with a pivot: above is good, below is bad. */
export type Tone = "positive" | "negative" | "muted";

export function toneOf(value: number | null | undefined, pivot = 0): Tone {
  if (value == null || Number.isNaN(value) || value === pivot) return "muted";
  return value > pivot ? "positive" : "negative";
}

/** What a rise means: good news, bad news (deaths, time to first item), or neither (a figure that only describes). */
export type Polarity = "higher-is-better" | "lower-is-better" | "neutral";

/**
 * The tone of a change read through its polarity: a fall is good news when lower is better, and a neutral figure is
 * never colored. Delta and DivergingBar both take their tone from here, so a bar never contradicts the number beside it.
 */
export function deltaTone(value: number | null | undefined, polarity: Polarity = "higher-is-better"): Tone {
  if (polarity === "neutral" || value == null) return "muted";
  return toneOf(polarity === "lower-is-better" ? -value : value);
}

export const TONE_TEXT: Record<Tone, string> = {
  positive: "text-positive",
  negative: "text-negative",
  muted: "text-muted-foreground",
};

export const TONE_BG: Record<Tone, string> = {
  positive: "bg-positive",
  negative: "bg-negative",
  muted: "bg-muted-foreground",
};

export const TONE_BORDER: Record<Tone, string> = {
  positive: "border-positive",
  negative: "border-negative",
  muted: "border-border",
};

/** A tinted chip surface: text, border and a faint fill in the tone's color. */
export const TONE_SOFT: Record<Tone, string> = {
  positive: "border-positive/30 bg-positive/10 text-positive",
  negative: "border-negative/30 bg-negative/10 text-negative",
  muted: "border-hairline bg-subtle-hover text-muted-foreground",
};

/** Mark colors for SVG and canvas, where a class cannot reach. */
export const TONE_COLOR: Record<Tone, `var(--${string})`> = {
  positive: "var(--positive)",
  negative: "var(--negative)",
  muted: "var(--muted-foreground)",
};
