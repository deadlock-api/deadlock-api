export const UPDATE_INTERVAL_MS = 5 * 60 * 1000;

export const DEFAULT_VARIABLES = [
  "leaderboard_rank_img",
  "leaderboard_place",
  "wins_losses_today",
  "total_kd",
  "hours_played",
];

export const DEFAULT_LABELS = ["Rank", "Place", "Daily W-L", "K/D", "Hours Played"];

export const THEME_STYLES = {
  default: {
    container: "bg-[#0a0a0a]",
    header: "text-white/90",
    stat: "bg-[#111111] hover:bg-[#1a1a1a]",
  },
  dark: {
    container: "bg-[#0a0a0a]",
    header: "text-white/90",
    stat: "bg-[#111111] hover:bg-[#1a1a1a]",
  },
  light: {
    container: "bg-white",
    header: "text-gray-900",
    stat: "bg-gray-50 hover:bg-gray-100",
  },
  glass: {
    container: "bg-black/10",
    header: "text-white",
    stat: "bg-white/5 hover:bg-white/10",
  },
} as const;
