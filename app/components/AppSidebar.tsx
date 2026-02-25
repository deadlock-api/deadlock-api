import { ExternalLink, Menu, Zap } from "lucide-react";
import { VisuallyHidden } from "radix-ui";
import { useState } from "react";
import { Link, useLocation } from "react-router";
import { Button } from "~/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "~/components/ui/sheet";
import { cn } from "~/lib/utils";

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/patron", label: "Prioritized Fetching", special: true },
  { to: "/heroes", label: "Heroes" },
  { to: "/items", label: "Items" },
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/badge-distribution", label: "Rank Distribution" },
  { to: "/chat", label: "AI Chat" },
  { to: "/streamkit", label: "Stream Kit" },
] as const;

const bottomNavLinks = [
  { to: "/ingest-cache", label: "Data Ingest" },
  { to: "/data-privacy", label: "Data Privacy" },
] as const;

const socialLinks = [
  {
    href: "https://www.patreon.com/c/manuelhexe",
    title: "Support us on Patreon",
    hoverClass: "hover:text-[#f96854]",
    icon: (
      <svg
        className="w-5 h-5 md:w-6 md:h-6"
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
        className="w-5 h-5 md:w-6 md:h-6"
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
    hoverClass: "hover:text-[#7289da]",
    icon: (
      <svg className="w-5 h-5 md:w-6 md:h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
      </svg>
    ),
  },
  {
    href: "https://github.com/deadlock-api/",
    title: "GitHub",
    hoverClass: "hover:text-white",
    icon: (
      <svg className="w-5 h-5 md:w-6 md:h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.184 6.839 9.504.5.092.682-.217.682-.483 0-.237-.009-.868-.014-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.004.07 1.532 1.032 1.532 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.339-2.221-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.025A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.295 2.748-1.025 2.748-1.025.546 1.378.202 2.397.1 2.65.64.7 1.028 1.595 1.028 2.688 0 3.847-2.337 4.695-4.566 4.944.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.744 0 .268.18.58.688.482C19.138 20.2 22 16.448 22 12.021 22 6.484 17.523 2 12 2z" />
      </svg>
    ),
  },
] as const;

function isActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname.startsWith(to);
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();

  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="p-4 border-b border-sidebar-border">
        <Link to="/" prefetch="intent" onClick={onNavigate} className="flex items-center gap-3">
          <img
            src="https://deadlock-api.com/favicon.webp"
            alt="Icon"
            width={32}
            height={32}
            className="aspect-square object-contain"
          />
          <span className="text-lg font-semibold">Deadlock API</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navLinks.map((link) =>
          link.special ? (
            <Link
              key={link.to}
              to={link.to}
              prefetch="intent"
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium transition-all duration-100",
                "bg-primary/20 text-primary border border-primary/40 animate-pulse hover:animate-none hover:bg-primary/30",
                isActive(pathname, link.to) && "animate-none bg-primary/30",
              )}
            >
              <Zap className="h-4 w-4" />
              {link.label}
            </Link>
          ) : (
            <Link
              key={link.to}
              to={link.to}
              prefetch="intent"
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium transition-colors duration-100",
                isActive(pathname, link.to)
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              {link.label}
            </Link>
          ),
        )}
      </nav>

      {/* Bottom nav links */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        {bottomNavLinks.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            prefetch="intent"
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium transition-colors duration-100",
              isActive(pathname, link.to)
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
            )}
          >
            {link.label}
          </Link>
        ))}
      </div>

      {/* Service links */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        <p className="px-3 py-1 text-xs font-semibold uppercase text-sidebar-foreground/50 tracking-wider">Services</p>
        {(
          [
            { href: "https://assets.deadlock-api.com", label: "Assets API" },
            { href: "https://api.deadlock-api.com", label: "Game Data API" },
            { href: "https://files.deadlock-api.com/Default/buckets/db-snapshot/public/", label: "Database Dumps" },
            { href: "https://github.com/deadlock-api/deadlock-live-events", label: "Live Events API" },
          ] as const
        ).map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between px-3 py-1.5 rounded-md text-base text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors duration-100"
          >
            {link.label}
            <ExternalLink className="h-3 w-3 opacity-50" />
          </a>
        ))}
      </div>

      {/* Social links */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center justify-center gap-1">
          {socialLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn("p-2 md:p-2.5 text-gray-500 rounded", link.hoverClass)}
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
        className="fixed top-3 left-3 z-40 bg-sidebar/80 backdrop-blur-sm border border-sidebar-border"
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

export default function AppSidebar() {
  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 z-30 border-r border-sidebar-border">
      <SidebarContent />
    </aside>
  );
}
