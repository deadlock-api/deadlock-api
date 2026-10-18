export const UPDATE_INTERVAL_MS = 5 * 60 * 1000;

export const DEFAULT_VARIABLES = ["rank_img", "leaderboard_place", "wins_losses_today", "total_kd", "hours_played"];

export const DEFAULT_LABELS = ["Rank", "Place", "Daily W-L", "K/D", "Hours Played"];

export const DEFAULT_SUBTEXTS = ["{rank_progress}", "", "", "", ""];

/**
 * Per-theme overlay colors. `win` and `loss` are the site's positive and negative, darkened on the light theme so the
 * result bar stays 3:1 against white; a match's result is also told apart without color (see MatchItem).
 */
export const THEME_STYLES = {
  dark: {
    container: "bg-[#0a0a0a]",
    header: "text-white/90",
    win: "text-positive",
    loss: "text-negative",
  },
  light: {
    container: "bg-white",
    header: "text-gray-900",
    win: "[color:color-mix(in_oklch,var(--positive),black_15%)]",
    loss: "[color:color-mix(in_oklch,var(--negative),black_10%)]",
  },
  glass: {
    container: "bg-black/10",
    header: "text-white",
    win: "text-positive",
    loss: "text-negative",
  },
} as const;
