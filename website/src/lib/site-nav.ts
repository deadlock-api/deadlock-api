import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  Database,
  Gamepad2,
  GraduationCap,
  HardDrive,
  Home,
  ListOrdered,
  Map,
  Medal,
  Radio,
  Shield,
  ShoppingBag,
  Swords,
  Trophy,
  Users,
  UserSearch,
  UsersRound,
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

export const navGroups: NavGroup[] = [
  {
    label: "Patron",
    links: [
      { to: "/patron", label: "Prioritized Fetching", icon: Zap, special: true },
      { to: "/tracker", label: "Player Tracker", icon: UserSearch },
    ],
  },
  {
    label: "Analytics",
    links: [
      { to: "/games", label: "Games", icon: BarChart3 },
      { to: "/heroes", label: "Heroes", icon: Swords },
      { to: "/items", label: "Items", icon: ShoppingBag },
      { to: "/abilities", label: "Abilities", icon: ListOrdered },
      { to: "/players", label: "Players", icon: Users },
      { to: "/team-builder", label: "Team Builder", icon: UsersRound },
    ],
  },
  {
    label: "Community",
    links: [
      { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
      { to: "/badge-distribution", label: "Rank Distribution", icon: Medal },
      { to: "/heatmap", label: "Kill Heatmap", icon: Map },
    ],
  },
  {
    label: "Tools",
    links: [
      { to: "/streamkit", label: "Stream Kit", icon: Radio },
      { to: "/data-dumps", label: "MCP & Data Dumps", icon: HardDrive },
      { to: "/blog", label: "Blog", icon: BookOpen },
    ],
  },
  {
    label: "Games",
    links: [
      { to: "/deadlockdle", label: "Deadlockdle", icon: Gamepad2 },
      { to: "/flashcards", label: "Flashcards", icon: GraduationCap },
    ],
  },
];

export const bottomNavLinks: NavLink[] = [
  { to: "/ingest-cache", label: "Data Ingest", icon: Database },
  { to: "/data-privacy", label: "Data Privacy", icon: Shield },
];
