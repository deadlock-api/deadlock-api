export const UPDATE_INTERVAL_MS = 5 * 60 * 1000;

export const DEFAULT_VARIABLES = ["rank_img", "leaderboard_place", "wins_losses_today", "total_kd", "hours_played"];

export const DEFAULT_LABELS = ["Rank", "Place", "Daily W-L", "K/D", "Hours Played"];

export const DEFAULT_SUBTEXTS = ["{rank_progress}", "", "", "", ""];

export const THEME_STYLES = {
  dark: {
    container: "bg-[#0a0a0a]",
    header: "text-white/90",
  },
  light: {
    container: "bg-white",
    header: "text-gray-900",
  },
  glass: {
    container: "bg-black/10",
    header: "text-white",
  },
} as const;
