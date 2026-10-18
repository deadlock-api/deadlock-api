/**
 * The share images are drawn by satori outside the DOM, where CSS variables do not exist: these are the values of the
 * tokens in src/styles/tokens.css they stand for. Change a token there, change it here.
 */
export const OG = {
  // ds-allow color-literal: --background (ink-950); satori cannot read CSS variables
  background: "#010409",
  // ds-allow color-literal: --card (ink-900)
  card: "#0d1117",
  // ds-allow color-literal: --border (ink-700)
  border: "#21262d",
  // ds-allow color-literal: --foreground (ink-100)
  foreground: "#e6edf3",
  // ds-allow color-literal: --muted-foreground (ink-400)
  muted: "#8b949e",
  // ds-allow color-literal: --primary (red-500)
  primary: "#fa4454",
  // ds-allow color-literal: --table-total (red-950), the brand red at 10% over the card
  primarySoft: "#25161d",
} as const;

/** `COMPARE_COLORS` in the same order: a player's color on the compare card is their color on the page. */
export const OG_COMPARE = [
  // ds-allow color-literal: --compare-1 (red-500)
  "#fa4454",
  // ds-allow color-literal: --compare-2 (series-green)
  "#199e70",
  // ds-allow color-literal: --compare-3 (series-steel)
  "#3d74b0",
  // ds-allow color-literal: --compare-4 (series-purple)
  "#a46bf5",
  // ds-allow color-literal: --compare-5 (series-plum)
  "#aa4a80",
] as const;
