import { useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  ChevronDown,
  Crosshair,
  Database,
  Ear,
  ExternalLink,
  Gamepad2,
  HelpCircle,
  Home,
  ListOrdered,
  Map,
  Medal,
  Menu,
  MessageSquare,
  Puzzle,
  Radio,
  Shield,
  ShoppingBag,
  Swords,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { VisuallyHidden } from "radix-ui";
import { useCallback, useState } from "react";
import { Link, useLocation } from "react-router";

import { Button } from "~/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "~/components/ui/sheet";
import { API_ORIGIN, ASSETS_ORIGIN } from "~/lib/constants";
import { prefetchRouteQueries } from "~/lib/prefetch";
import { cn } from "~/lib/utils";

interface NavLink {
  to: string;
  label: string;
  icon: LucideIcon;
  special?: boolean;
  children?: NavLink[];
}

interface NavGroup {
  label: string;
  links: NavLink[];
}

const topLinks: NavLink[] = [
  { to: "/patron", label: "Prioritized Fetching", icon: Zap, special: true },
  { to: "/", label: "Home", icon: Home },
];

const navGroups: NavGroup[] = [
  {
    label: "Analytics",
    links: [
      { to: "/games", label: "Games", icon: BarChart3 },
      { to: "/heroes", label: "Heroes", icon: Swords },
      { to: "/items", label: "Items", icon: ShoppingBag },
      { to: "/abilities", label: "Abilities", icon: ListOrdered },
    ],
  },
  {
    label: "Community",
    links: [
      { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
      { to: "/player-scoreboard", label: "Player Scoreboard", icon: Users },
      { to: "/badge-distribution", label: "Rank Distribution", icon: Medal },
      { to: "/heatmap", label: "Kill Heatmap", icon: Map },
    ],
  },
  {
    label: "Tools",
    links: [
      { to: "/chat", label: "AI Chat", icon: MessageSquare },
      { to: "/streamkit", label: "Stream Kit", icon: Radio },
    ],
  },
  {
    label: "Games",
    links: [
      {
        to: "/deadlockdle",
        label: "Deadlockdle",
        icon: Gamepad2,
        children: [
          { to: "/deadlockdle/guess-hero", label: "Guess the Hero", icon: Crosshair },
          { to: "/deadlockdle/guess-item", label: "Guess the Item", icon: ShoppingBag },
          { to: "/deadlockdle/guess-sound", label: "Guess the Sound", icon: Ear },
          { to: "/deadlockdle/guess-ability", label: "Ability to Hero", icon: Swords },
          { to: "/deadlockdle/item-stats", label: "Item Stats Quiz", icon: Puzzle },
          { to: "/deadlockdle/trivia", label: "Trivia", icon: HelpCircle },
        ],
      },
    ],
  },
];

const bottomNavLinks: NavLink[] = [
  { to: "/ingest-cache", label: "Data Ingest", icon: Database },
  { to: "/data-privacy", label: "Data Privacy", icon: Shield },
];

const socialLinks = [
  {
    href: "https://www.patreon.com/c/manuelhexe",
    title: "Support us on Patreon",
    hoverClass: "hover:text-primary",
    icon: (
      <svg
        className="h-5 w-5 md:h-6 md:w-6"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 180 180"
        aria-hidden
      >
        <path
          fill="currentColor"
          d="M108.8135992 26.06720125c-26.468266 0-48.00213212 21.53066613-48.00213212 47.99733213 0 26.38653268 21.53386613 47.85426547 48.00213213 47.85426547 26.38639937 0 47.8530655-21.4677328 47.8530655-47.85426547 0-26.466666-21.46666613-47.99733213-47.85306547-47.99733213"
        />
        <path fill="currentColor" d="M23.333335 153.93333178V26.0666679h23.46666576v127.8666639z" />
      </svg>
    ),
  },
  {
    href: "https://stats.uptimerobot.com/V1HIfGQT77",
    title: "Service Status",
    hoverClass: "hover:text-green-400",
    icon: (
      <svg
        className="h-5 w-5 md:h-6 md:w-6"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
        aria-hidden
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="6" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: "https://discord.gg/pqWQfTPQJu",
    title: "Discord",
    hoverClass: "hover:text-[#5865F2]",
    icon: (
      <svg className="h-5 w-5 md:h-6 md:w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
      </svg>
    ),
  },
  {
    href: "https://github.com/deadlock-api/",
    title: "GitHub",
    hoverClass: "hover:text-white",
    icon: (
      <svg className="h-5 w-5 md:h-6 md:w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.184 6.839 9.504.5.092.682-.217.682-.483 0-.237-.009-.868-.014-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.004.07 1.532 1.032 1.532 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.339-2.221-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.025A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.295 2.748-1.025 2.748-1.025.546 1.378.202 2.397.1 2.65.64.7 1.028 1.595 1.028 2.688 0 3.847-2.337 4.695-4.566 4.944.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.744 0 .268.18.58.688.482C19.138 20.2 22 16.448 22 12.021 22 6.484 17.523 2 12 2z" />
      </svg>
    ),
  },
] as const;

function isActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname.startsWith(to);
}

function NavItem({ link, onNavigate }: { link: NavLink; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const active = isActive(pathname, link.to);
  const Icon = link.icon;
  const queryClient = useQueryClient();

  const handleMouseEnter = useCallback(() => {
    prefetchRouteQueries(link.to, queryClient);
  }, [link.to, queryClient]);

  if (link.special) {
    return (
      <Link
        to={link.to}
        onClick={onNavigate}
        onMouseEnter={handleMouseEnter}
        className={cn(
          "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-150",
          "border border-primary/30 bg-primary/15 text-primary hover:bg-primary/25",
          active && "border-primary/50 bg-primary/25",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {link.label}
      </Link>
    );
  }

  return (
    <Link
      to={link.to}
      onClick={onNavigate}
      onMouseEnter={handleMouseEnter}
      className={cn(
        "flex items-center gap-2.5 rounded-md border-l-2 px-3 py-1.5 text-sm font-medium transition-colors duration-150",
        active
          ? "border-primary bg-sidebar-accent text-sidebar-accent-foreground"
          : "border-transparent text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-sidebar-foreground/40")} />
      {link.label}
    </Link>
  );
}

function NavItemWithChildren({ link, onNavigate }: { link: NavLink; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const active = isActive(pathname, link.to);
  const Icon = link.icon;
  const [open, setOpen] = useState(false);

  return (
    <div>
      <div className="flex items-stretch">
        <Link
          to={link.to}
          prefetch="intent"
          onClick={onNavigate}
          className={cn(
            "flex-1 flex items-center gap-2.5 px-3 py-1.5 rounded-l-md text-sm font-medium transition-colors duration-150 border-l-2",
            active
              ? "bg-sidebar-accent text-sidebar-accent-foreground border-primary"
              : "border-transparent text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
          )}
        >
          <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-sidebar-foreground/40")} />
          {link.label}
        </Link>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex items-center px-2 rounded-r-md transition-colors duration-150",
            active
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/40 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground/60",
          )}
          aria-label={open ? "Collapse submenu" : "Expand submenu"}
        >
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")}
          />
        </button>
      </div>

      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          open ? "max-h-96 opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="ml-4 pl-3 border-l border-sidebar-border/50 mt-0.5 space-y-0.5">
          {link.children?.map((child) => {
            const childActive = isActive(pathname, child.to);
            const ChildIcon = child.icon;
            return (
              <Link
                key={child.to}
                to={child.to}
                prefetch="intent"
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-medium transition-colors duration-150",
                  childActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/50 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <ChildIcon className={cn("h-3.5 w-3.5 shrink-0", childActive ? "text-primary" : "text-sidebar-foreground/30")} />
                {child.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col text-sidebar-foreground">
      {/* Logo */}
      <div className="border-b border-sidebar-border px-4 py-3">
        <Link to="/" onClick={onNavigate} className="flex items-center gap-3">
          <img
            src="https://deadlock-api.com/favicon.webp"
            alt="Deadlock API Logo"
            width={32}
            height={32}
            className="aspect-square object-contain"
          />
          <span className="text-lg font-semibold">Deadlock API</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 pt-3 pb-1">
        {/* Top links (ungrouped) */}
        <div className="space-y-0.5">
          {topLinks.map((link) => (
            <NavItem key={link.to} link={link} onNavigate={onNavigate} />
          ))}
        </div>

        {/* Grouped sections */}
        {navGroups.map((group) => (
          <div key={group.label} className="mt-4">
            <p className="px-3 pb-1 text-xs font-semibold tracking-wider text-sidebar-foreground/40 uppercase">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.links.map((link) =>
                link.children ? (
                  <NavItemWithChildren key={link.to} link={link} onNavigate={onNavigate} />
                ) : (
                  <NavItem key={link.to} link={link} onNavigate={onNavigate} />
                ),
              )}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom nav links */}
      <div className="space-y-0.5 border-t border-sidebar-border px-3 py-2">
        {bottomNavLinks.map((link) => (
          <NavItem key={link.to} link={link} onNavigate={onNavigate} />
        ))}
      </div>

      {/* Service links */}
      <div className="border-t border-sidebar-border px-3 py-2">
        <p className="px-3 pb-1 text-xs font-semibold tracking-wider text-sidebar-foreground/40 uppercase">Services</p>
        <div className="space-y-0.5">
          {[
            { href: ASSETS_ORIGIN, label: "Assets API" },
            { href: API_ORIGIN, label: "Game Data API" },
            {
              href: "https://files.deadlock-api.com/Default/buckets/db-snapshot/public/",
              label: "Database Dumps",
            },
            {
              href: "https://github.com/deadlock-api/deadlock-live-events",
              label: "Live Events API",
            },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-md px-3 py-1 text-sm text-sidebar-foreground/60 transition-colors duration-150 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            >
              {link.label}
              <ExternalLink className="h-3 w-3 opacity-40" />
            </a>
          ))}
        </div>
      </div>

      {/* Social links */}
      <div className="border-t border-sidebar-border px-3 py-2">
        <div className="flex items-center justify-center gap-1">
          {socialLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn("rounded p-2 text-muted-foreground md:p-2.5", link.hoverClass)}
              title={link.title}
              aria-label={link.title}
            >
              {link.icon}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MobileMenuButton() {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="glass fixed top-3 left-3 z-40 border border-sidebar-border"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0" showCloseButton={false}>
          <VisuallyHidden.Root>
            <SheetTitle>Navigation</SheetTitle>
          </VisuallyHidden.Root>
          <SidebarContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside className="glass z-30 hidden border-r border-sidebar-border md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col">
      <SidebarContent />
    </aside>
  );
}
