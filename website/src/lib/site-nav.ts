import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  BookOpen,
  Clapperboard,
  Crosshair,
  Database,
  Gamepad2,
  GitCompareArrows,
  GraduationCap,
  Hammer,
  HardDrive,
  Home,
  ListOrdered,
  Map,
  Medal,
  Palette,
  Radio,
  Shield,
  Sparkles,
  ShoppingBag,
  Swords,
  Trophy,
  UserSearch,
  Users,
  UsersRound,
  Volume2,
  Zap,
} from "lucide-react";

export interface NavLink {
  to: string;
  label: string;
  icon: LucideIcon;
  special?: boolean;
}

export interface NavGroup {
  label: string;
  links: NavLink[];
}

export const topLinks: NavLink[] = [{ to: "/", label: "Home", icon: Home }];

/**
 * The yearly recap, under Home while it is open (1 December to 15 January, always on the dev server). The sidebar
 * decides after hydration with `useRecapOpen`, since the server has no clock the client agrees with.
 */
export const yearRecapLink: NavLink = {
  to: "/year-in-deadlock",
  label: "Year in Deadlock",
  icon: Sparkles,
  special: true,
};

export const navGroups: NavGroup[] = [
  {
    label: "Patron",
    links: [
      { to: "/patron", label: "Prioritized Fetching", icon: Zap, special: true },
      { to: "/tracker/demo", label: "Player Tracker", icon: UserSearch },
    ],
  },
  {
    label: "Analytics",
    links: [
      { to: "/analytics/games", label: "Games", icon: BarChart3 },
      { to: "/analytics/heroes", label: "Heroes", icon: Swords },
      { to: "/analytics/items", label: "Items", icon: ShoppingBag },
      { to: "/analytics/builds", label: "Builds", icon: Hammer },
      { to: "/analytics/abilities", label: "Abilities", icon: ListOrdered },
      { to: "/patches", label: "Patch Changes", icon: GitCompareArrows },
      { to: "/analytics/players", label: "Players", icon: Users },
      { to: "/analytics/team-builder", label: "Team Builder", icon: UsersRound },
    ],
  },
  {
    label: "Community",
    links: [
      { to: "/community/leaderboard", label: "Leaderboard", icon: Trophy },
      { to: "/community/badge-distribution", label: "Rank Distribution", icon: Medal },
      { to: "/community/heatmap", label: "Kill Heatmap", icon: Map },
    ],
  },
  {
    label: "Tools",
    links: [
      { to: "/streamkit", label: "Stream Kit", icon: Radio },
      { to: "/data-dumps", label: "MCP & Data Dumps", icon: HardDrive },
      { to: "/crosshair", label: "Crosshair Editor", icon: Crosshair },
      { to: "/sounds", label: "Sounds", icon: Volume2 },
      { to: "/blog", label: "Blog", icon: BookOpen },
    ],
  },
  {
    label: "Games",
    links: [
      { to: "/games/deadlockdle", label: "Deadlockdle", icon: Gamepad2 },
      { to: "/games/flashcards", label: "Flashcards", icon: GraduationCap },
      { to: "/games/guess-the-rank", label: "Guess the Rank", icon: Clapperboard },
    ],
  },
  // The route itself returns 404 outside the dev server; this only keeps the link out of production navigation.
  ...(import.meta.env.DEV
    ? [{ label: "Dev", links: [{ to: "/dev/design-system", label: "Design System", icon: Palette }] }]
    : []),
];

export const bottomNavLinks: NavLink[] = [
  { to: "/live", label: "Live API Traffic", icon: Activity },
  { to: "/ingest-cache", label: "Data Ingest", icon: Database },
  { to: "/data-privacy", label: "Data Privacy", icon: Shield },
];
