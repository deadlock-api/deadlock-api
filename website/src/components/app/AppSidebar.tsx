import { useLocation } from "@tanstack/react-router";
import { Code } from "lucide-react";

import { SocialLinks } from "~/components/domain/brand/BrandIcons";
import { SmartLink } from "~/components/domain/navigation/SmartLink";
import { SideNav, SideNavFooter, SideNavGroup, SideNavItem } from "~/components/patterns/navigation/SideNav";
import {
  SideNavBrand,
  SideNavDrawer,
  SideNavHeader,
  SideNavShell,
} from "~/components/patterns/navigation/SideNavShell";
import { Button } from "~/components/ui/button";
import { API_ORIGIN } from "~/lib/constants";
import { bottomNavLinks, type NavLink, navGroups, topLinks } from "~/lib/site-nav";

function isActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  // Tracker profiles belong to the tracker hub's navigation entry.
  if (/^\/tracker\/players\/\d+/.test(pathname)) return to === "/tracker";
  return pathname.startsWith(to);
}

function NavItem({ link }: { link: NavLink }) {
  const active = useLocation({ select: (location) => isActive(location.pathname, link.to) });
  const exact = useLocation({ select: (location) => (location.pathname.replace(/\/$/, "") || "/") === link.to });
  const Icon = link.icon;
  return (
    // The entry of the section a page is in is current, but only the page's own entry is that page.
    <SideNavItem
      asChild
      active={active}
      aria-current={active ? (exact ? "page" : "true") : undefined}
      variant={link.special ? "highlight" : "default"}
    >
      <SmartLink href={link.to}>
        <Icon />
        <span className="truncate">{link.label}</span>
      </SmartLink>
    </SideNavItem>
  );
}

function SidebarContent() {
  return (
    <>
      <SideNavHeader>
        <SideNavBrand asChild>
          <SmartLink href="/">
            <img
              src="https://deadlock-api.com/favicon.webp"
              loading="lazy"
              fetchPriority="low"
              alt="Deadlock API Logo"
              width={32}
              height={32}
              className="aspect-square object-contain"
            />
            <span className="truncate">Deadlock API</span>
          </SmartLink>
        </SideNavBrand>
      </SideNavHeader>

      <SideNav aria-label="Main" className="flex-1 overflow-y-auto px-3 pt-3 pb-1">
        <SideNavGroup>
          {topLinks.map((link) => (
            <NavItem key={link.to} link={link} />
          ))}
        </SideNavGroup>
        {navGroups.map((group) => (
          <SideNavGroup key={group.label} label={group.label}>
            {group.links.map((link) => (
              <NavItem key={link.to} link={link} />
            ))}
          </SideNavGroup>
        ))}
      </SideNav>

      <SideNavFooter>
        <Button asChild variant="soft" size="sm" className="w-full">
          <a href={`${API_ORIGIN}/docs`} target="_blank" rel="noopener noreferrer">
            <Code />
            API Documentation
          </a>
        </Button>
      </SideNavFooter>

      <SideNavFooter className="grid grid-cols-2 gap-1">
        {bottomNavLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Button key={link.to} asChild variant="outline" size="sm" className="text-xs text-muted-foreground">
              <SmartLink href={link.to}>
                <Icon className="size-3" />
                {link.label}
              </SmartLink>
            </Button>
          );
        })}
      </SideNavFooter>

      <SideNavFooter>
        <SocialLinks />
      </SideNavFooter>
    </>
  );
}

export function MobileMenuButton() {
  return (
    <SideNavDrawer>
      <SidebarContent />
    </SideNavDrawer>
  );
}

export function AppSidebar() {
  return (
    <SideNavShell>
      <SidebarContent />
    </SideNavShell>
  );
}
