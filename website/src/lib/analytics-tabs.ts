import { redirect } from "@tanstack/react-router";

/** Existing tab values remain stable inside the UI; paths are the public navigation contract. */
export const ANALYTICS_TABS = {
  heroes: {
    stats: "",
    "stats-over-time": "over-time",
    "stats-by-duration": "by-duration",
    "stats-by-rank": "by-rank",
    "stats-by-experience": "by-experience",
    "hero-combs": "combos",
    matchups: "matchups",
    "hero-matchup-details": "matchup-details",
    "hero-scoreboard": "scoreboard",
  },
  items: {
    "item-stats": "",
    "item-purchase-analysis": "item-purchase-analysis",
    "build-flow": "build-flow",
    "item-combos": "combos",
  },
  games: { overview: "", "over-time": "over-time", "by-rank": "by-rank", economy: "economy" },
  players: { scoreboard: "", "stats-metrics": "stats-metrics" },
} as const;

export type AnalyticsSection = keyof typeof ANALYTICS_TABS;
export type AnalyticsTab<S extends AnalyticsSection> = keyof (typeof ANALYTICS_TABS)[S] & string;

export function analyticsTabPath<S extends AnalyticsSection>(section: S, tab: AnalyticsTab<S>): string {
  const suffixes: Readonly<Record<string, string>> = ANALYTICS_TABS[section];
  const suffix = suffixes[tab];
  return `/analytics/${section}${suffix ? `/${suffix}` : ""}`;
}

export function analyticsTabFromPath<S extends AnalyticsSection>(section: S, pathname: string): AnalyticsTab<S> {
  const entries = Object.entries(ANALYTICS_TABS[section]);
  const suffix = pathname.replace(/\/$/, "").slice(`/analytics/${section}`.length).replace(/^\//, "");
  return (entries.find(([, path]) => path === suffix) ?? entries[0])[0] as AnalyticsTab<S>;
}

/** Translate old ?tab= links once; an explicit view path takes precedence over a stale query tab. */
export function canonicalAnalyticsHref(href: string): string | null {
  const url = new URL(href, "https://deadlock-api.com");
  const pathname = url.pathname.replace(/\/$/, "");
  const section = pathname.split("/")[2] as AnalyticsSection;
  if (!pathname.startsWith("/analytics/") || !Object.hasOwn(ANALYTICS_TABS, section) || !url.searchParams.has("tab"))
    return null;
  const tabs = ANALYTICS_TABS[section];
  const base = `/analytics/${section}`;
  if (!Object.values(tabs).some((suffix) => pathname === base + (suffix ? `/${suffix}` : ""))) return null;
  const tab = url.searchParams.get("tab")!;
  if (pathname === base && Object.hasOwn(tabs, tab)) {
    url.pathname = analyticsTabPath(section, tab as AnalyticsTab<typeof section>);
  }
  url.searchParams.delete("tab");
  return url.pathname + url.search + url.hash;
}

export function redirectAnalyticsTab({ location }: { location: { href: string } }) {
  const href = canonicalAnalyticsHref(location.href);
  if (href) throw redirect({ href, statusCode: 301 });
}

/**
 * What each view is called, to search engines and to the reader: every view is its own page, so it gets its own title,
 * meta description and main heading instead of the section's. `title` gets the site suffix from `pageTitle`; `description`
 * leaves room for a data-driven sentence the section's `head` may append (the current win-rate leader).
 */
export interface AnalyticsViewCopy {
  /** Document title before the site suffix. */
  title: string;
  /** The page's main heading. */
  heading: string;
  /** Line under the heading. */
  summary: string;
  /** Meta description, and the Dataset JSON-LD description. */
  description: string;
}

export const ANALYTICS_VIEWS: { [S in AnalyticsSection]: Record<AnalyticsTab<S>, AnalyticsViewCopy> } = {
  heroes: {
    stats: {
      title: "Deadlock Hero Win Rates & Pick Rates",
      heading: "Deadlock Hero Win Rates",
      summary: "Compare hero performance across ranks, patches, and game modes.",
      description:
        "Win, pick and ban rates for every Deadlock hero. Filter by rank, patch and game mode, updated daily.",
    },
    "stats-over-time": {
      title: "Deadlock Hero Win Rate Trends Over Time",
      heading: "Deadlock Hero Trends Over Time",
      summary: "Compare hero trends across ranks, patches, and game modes.",
      description:
        "How each Deadlock hero's win rate and pick rate moved day by day and patch by patch, by rank and mode.",
    },
    "stats-by-duration": {
      title: "Deadlock Hero Win Rates by Match Length",
      heading: "Deadlock Hero Win Rates by Match Length",
      summary: "Which heroes win short games and which scale into long ones.",
      description:
        "Deadlock hero win rates by match length: which heroes win early, which scale late. Filter by rank and patch.",
    },
    "stats-by-rank": {
      title: "Deadlock Hero Win Rates by Rank",
      heading: "Deadlock Hero Win Rates by Rank",
      summary: "How each hero performs from Initiate to Eternus.",
      description:
        "Deadlock hero win rates and pick rates at every rank, from Initiate to Eternus. See which heroes climb.",
    },
    "stats-by-experience": {
      title: "Deadlock Hero Win Rates by Player Experience",
      heading: "Deadlock Hero Win Rates by Experience",
      summary: "How win rates change as players put more matches into a hero.",
      description:
        "How Deadlock hero win rates change with games played on the hero: which heroes reward practice most.",
    },
    "hero-combs": {
      title: "Deadlock Hero Combos & Team Synergies",
      heading: "Deadlock Hero Combos",
      summary: "Hero pairs and teams that win more together.",
      description:
        "Deadlock hero combos and team synergies: the hero pairs and teams with the highest win rates together.",
    },
    matchups: {
      title: "Deadlock Hero Matchups & Counters",
      heading: "Deadlock Hero Matchups",
      summary: "Every hero against every other, as enemies and as allies.",
      description:
        "Deadlock hero matchups and counters: win rates for every hero against every other. Filter by rank and patch.",
    },
    "hero-matchup-details": {
      title: "Deadlock Hero Matchup Explorer",
      heading: "Deadlock Hero Matchup Explorer",
      summary: "Discover the allies and opponents that change your game.",
      description:
        "Pick a Deadlock hero and see its best and worst matchups, allies and enemies, with win rates from live matches.",
    },
    "hero-scoreboard": {
      title: "Deadlock Hero Scoreboard: Kills & Souls",
      heading: "Deadlock Hero Scoreboard",
      summary: "Heroes ranked by win rate, kills, souls, damage and more.",
      description: "Rank Deadlock heroes by win rate, kills, deaths, souls, damage and other per-match averages.",
    },
  },
  items: {
    "item-stats": {
      title: "Deadlock Item Win Rates & Build Stats",
      heading: "Deadlock Item Win Rates",
      summary: "Win rates with confidence intervals for every item.",
      description: "Win rates for every Deadlock item with confidence intervals. Filter by hero, rank and patch.",
    },
    "item-purchase-analysis": {
      title: "Deadlock Item Purchase Timing",
      heading: "Deadlock Item Purchase Timing",
      summary: "How an item's win rate changes with when it is bought.",
      description: "When to buy each Deadlock item: win rate by purchase time, per hero and rank, from live matches.",
    },
    "build-flow": {
      title: "Deadlock Item Build Flow & Build Orders",
      heading: "Deadlock Item Build Flow",
      summary: "The paths builds take from one purchase to the next.",
      description:
        "How Deadlock builds unfold: the items players buy next after each purchase, with win rates per path.",
    },
    "item-combos": {
      title: "Deadlock Item Combos & Synergies",
      heading: "Deadlock Item Combos",
      summary: "Items that win more when bought together.",
      description:
        "Deadlock item combos: the item pairs and sets with the highest win rates together. Filter by hero and rank.",
    },
  },
  games: {
    overview: {
      title: "Deadlock Match Stats: Length, Kills & Souls",
      heading: "Deadlock Match Stats",
      summary: "Aggregate match statistics.",
      description:
        "Deadlock match stats: average match length, kills, souls and objective timings. See how long a typical game lasts.",
    },
    "over-time": {
      title: "Deadlock Match Trends Over Time",
      heading: "Deadlock Match Trends Over Time",
      summary: "How match length, kills and souls move across patches.",
      description: "How Deadlock match length, kills, souls and objectives changed day by day and patch by patch.",
    },
    "by-rank": {
      title: "Deadlock Match Stats by Rank",
      heading: "Deadlock Match Stats by Rank",
      summary: "How match length, kills and souls differ by rank.",
      description: "Deadlock match length, kills, souls and objective timings at every rank, from Initiate to Eternus.",
    },
    economy: {
      title: "Deadlock Soul Economy: Sources & Net Worth",
      heading: "Deadlock Soul Economy",
      summary: "Where souls come from and how net worth grows.",
      description:
        "Where Deadlock souls come from, how the sources shift by rank, and how net worth grows over a match.",
    },
  },
  players: {
    scoreboard: {
      title: "Deadlock Player Scoreboard: Top Players",
      heading: "Deadlock Player Scoreboard",
      summary: "The best player averages across the community.",
      description: "Top Deadlock players by kills, win rate, souls, damage and more. Filter by hero, rank and patch.",
    },
    "stats-metrics": {
      title: "Deadlock Player Stat Distributions",
      heading: "Deadlock Player Stat Distributions",
      summary: "Where a stat line sits among all players.",
      description: "Percentile distributions of Deadlock player stats: see where your kills, souls and damage rank.",
    },
  },
};

/** The copy of the view a section path shows; unknown paths fall back to the section's first view. */
export function analyticsView(section: AnalyticsSection, pathname: string): AnalyticsViewCopy {
  return ANALYTICS_VIEWS[section][analyticsTabFromPath(section, pathname)];
}
