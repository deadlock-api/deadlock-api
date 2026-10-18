export const UPDATE_INTERVAL_MS = 5 * 60 * 1000;

/** The overlay page zooms its body by this much, so the widget is legible on a 1080p stream at OBS's 1:1 scale. */
export const WIDGET_SCALE = 3;

export const DEFAULT_VARIABLES = ["rank_img", "leaderboard_place", "wins_losses_today", "total_kd", "hours_played"];

export const DEFAULT_LABELS = ["Rank", "Place", "Daily W-L", "K/D", "Hours Played"];

export const DEFAULT_SUBTEXTS = ["{rank_progress}", "", "", "", ""];

/**
 * Below this background opacity (in percent) the game video shows through enough to wash out the overlay's text, so
 * the text gets the theme's halo.
 */
export const OPAQUE_ENOUGH = 60;

/**
 * Per-theme overlay styles, one source for each surface. `surface` is the box, `headerSurface` the name header, both
 * scaled by `--bg-opacity`; glass has no opacity, it is a dark scrim under a blur. `halo` keeps text readable over a
 * video frame (always on glass, below OPAQUE_ENOUGH on the others); `outline` is the box edge, 3:1 against its
 * surface. `win` and `loss` are the site's positive and negative, darkened on the light theme so the result bar stays
 * 4.5:1 against white; a match's result is also told apart without color (see MatchItem).
 */
export const THEME_STYLES = {
  dark: {
    surface: "[background:rgba(26,27,30,var(--bg-opacity))]",
    headerSurface:
      "[background:linear-gradient(to_right,rgba(26,27,30,var(--bg-opacity)),rgba(37,38,43,var(--bg-opacity)))] border-b border-hairline",
    header: "text-white/90",
    outline: "border border-hairline",
    halo: "text-shadow-sm text-shadow-black/80",
    win: "text-positive",
    loss: "text-negative",
  },
  light: {
    surface: "[background:rgba(255,255,255,var(--bg-opacity))]",
    headerSurface:
      "[background:linear-gradient(to_right,rgba(255,255,255,var(--bg-opacity)),rgba(249,250,251,var(--bg-opacity)))] border-b border-gray-900/5",
    header: "text-gray-900",
    outline: "border border-black/45",
    halo: "text-shadow-sm text-shadow-white/90",
    win: "[color:color-mix(in_oklch,var(--positive),black_15%)]",
    loss: "[color:color-mix(in_oklch,var(--negative),black_10%)]",
  },
  glass: {
    surface: "bg-black/40 backdrop-blur-md",
    headerSurface: "bg-white/5",
    header: "text-white",
    outline: "",
    halo: "text-shadow-sm text-shadow-black/80",
    win: "text-positive",
    loss: "text-negative",
  },
} as const;
