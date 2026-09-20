/** The meaning a number carries when it is compared with a pivot: above is good, below is bad. */
export type Tone = "positive" | "negative" | "neutral";

export function toneOf(value: number | null | undefined, pivot = 0): Tone {
  if (value == null || Number.isNaN(value) || value === pivot) return "neutral";
  return value > pivot ? "positive" : "negative";
}

export const TONE_TEXT: Record<Tone, string> = {
  positive: "text-positive",
  negative: "text-negative",
  neutral: "text-muted-foreground",
};

export const TONE_BG: Record<Tone, string> = {
  positive: "bg-positive",
  negative: "bg-negative",
  neutral: "bg-muted-foreground",
};

export const TONE_BORDER: Record<Tone, string> = {
  positive: "border-positive",
  negative: "border-negative",
  neutral: "border-border",
};

/** A tinted chip surface: text, border and a faint fill in the tone's color. */
export const TONE_SOFT: Record<Tone, string> = {
  positive: "border-positive/30 bg-positive/10 text-positive",
  negative: "border-negative/30 bg-negative/10 text-negative",
  neutral: "border-hairline bg-subtle-hover text-muted-foreground",
};

/** Mark colors for SVG and canvas, where a class cannot reach. */
export const TONE_COLOR: Record<Tone, `var(--${string})`> = {
  positive: "var(--positive)",
  negative: "var(--negative)",
  neutral: "var(--muted-foreground)",
};
