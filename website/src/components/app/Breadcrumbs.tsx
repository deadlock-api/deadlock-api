import { Link, useMatches, useRouterState } from "@tanstack/react-router";
import { Home } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
} from "~/components/patterns/navigation/Breadcrumb";

const ROUTE_LABELS: Record<string, string> = {
  "/analytics": "Analytics",
  "/community": "Community",
  "/players": "Player Tracker",
  "/analytics/heroes": "Hero Stats",
  "/analytics/items": "Item Stats",
  "/analytics/items/item-purchase-analysis": "Purchase Analysis",
  "/analytics/abilities": "Ability Stats",
  "/community/leaderboard": "Leaderboard",
  "/community/badge-distribution": "Rank Distribution",
  "/analytics/games": "Games",
  "/community/heatmap": "Kill Heatmap",
  "/analytics/players": "Player Analytics",
  "/tracker": "Player Tracker",
  "/streamkit": "Stream Kit",
  "/data-dumps": "MCP & Data Dumps",
  "/ingest-cache": "Data Ingest",
  "/data-privacy": "Data Privacy",
  "/patron": "Prioritized Fetching",
  "/blog": "Blog",
};

interface Crumb {
  label: string;
  path: string;
}

function buildBreadcrumbs(pathname: string, labelsByPath: Map<string, string>): Crumb[] {
  if (pathname === "/") return [];
  const segments = pathname.replace(/\/$/, "").split("/").filter(Boolean);
  const items: Crumb[] = [];
  let path = "";
  for (const segment of segments) {
    path += `/${segment}`;
    // /games is the legacy analytics URL; game hubs provide their own useful parent link.
    if (path === "/games" || path === "/tracker/players") continue;
    const label =
      labelsByPath.get(path) ??
      ROUTE_LABELS[path] ??
      segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    items.push({ label, path: path === "/players" ? "/tracker" : path });
  }
  return items;
}

export function Breadcrumbs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Archive puzzles carry ?date=; the hub crumb keeps it so players land back on the day they were replaying.
  const puzzleDate = useRouterState({ select: (s) => (s.location.search as { date?: string }).date });
  // Routes with dynamic segments return a `breadcrumb` label from their loader.
  const labelsByPath = useMatches({
    select: (matches) => {
      const labels = new Map<string, string>();
      for (const match of matches) {
        const data = match.loaderData as { breadcrumb?: unknown } | undefined;
        if (typeof data?.breadcrumb === "string") labels.set(match.pathname.replace(/\/$/, ""), data.breadcrumb);
      }
      return labels;
    },
  });
  // A not-found path has no page behind its segments, so a trail built from them would point nowhere.
  const isNotFound = useMatches({
    // oxlint-disable-next-line no-underscore-dangle -- TanStack Router exposes this state as _notFound.
    select: (matches) => matches.some((match) => match.status === "notFound" || match._notFound),
  });
  const items = isNotFound ? [] : buildBreadcrumbs(pathname, labelsByPath);

  if (items.length === 0) return null;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://deadlock-api.com/" },
      ...items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 2,
        name: item.label,
        item: `https://deadlock-api.com${item.path}`,
      })),
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <Breadcrumb className="ps-8 md:ps-0">
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/" aria-label="Home">
              <Home />
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <BreadcrumbItem key={item.path}>
              {isLast ? (
                <BreadcrumbPage>{item.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link
                    to={item.path}
                    search={item.path === "/games/deadlockdle" && puzzleDate ? { date: puzzleDate } : undefined}
                  >
                    {item.label}
                  </Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          );
        })}
      </Breadcrumb>
    </>
  );
}
