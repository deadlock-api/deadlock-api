import type { CSSProperties } from "react";

import type { Tone } from "./report";

// One hex per tone. SVG strokes, recharts series and alpha-blended
// backgrounds all derive from this so the palette stays coherent.
export const TONE_COLORS: Record<Tone, string> = {
  neutral: "#8b949e",
  info: "#22d3ee",
  success: "#34d399",
  warning: "#f59e0b",
  critical: "#fa4454",
  tip: "#a78bfa",
  accent: "#fa4454",
  team0: "#f0a92b",
  team1: "#3b9dff",
};

// Default chart series palette (maps to --chart-1..5 plus extras).
export const CHART_PALETTE = ["#fa4454", "#22d3ee", "#a78bfa", "#f59e0b", "#34d399", "#ff6b7a"];

export function toneColor(tone: Tone = "neutral"): string {
  return TONE_COLORS[tone] ?? TONE_COLORS.neutral;
}

export function hexAlpha(hex: string, alpha: number): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Soft "chip"/surface treatment: tinted background, matching border + text.
export function toneSurface(tone: Tone = "neutral", strength = 1): CSSProperties {
  const hex = toneColor(tone);
  return {
    color: hex,
    backgroundColor: hexAlpha(hex, 0.1 * strength),
    borderColor: hexAlpha(hex, 0.3 * strength),
  };
}

export function teamLabel(team: 0 | 1): string {
  return team === 0 ? "The Hidden King" : "The Archmother";
}
