import { Link, useMatches, useRouterState } from "@tanstack/react-router";
import { ChevronRight, Home } from "lucide-react";

const ROUTE_LABELS: Record<string, string> = {
  "/heroes": "Hero Stats",
  "/items": "Item Stats",
  "/abilities": "Ability Stats",
  "/leaderboard": "Leaderboard",
  "/badge-distribution": "Rank Distribution",
  "/games": "Games",
  "/heatmap": "Kill Heatmap",
  "/players": "Player Analytics",
  "/tracker": "Player Tracker",
  "/streamkit": "Stream Kit",
  "/ingest-cache": "Data Ingest",
  "/data-privacy": "Data Privacy",
  "/patron": "Prioritized Fetching",
  "/blog": "Blog",
};

interface BreadcrumbItem {
  label: string;
  path: string;
}

function buildBreadcrumbs(pathname: string, labelsByPath: Map<string, string>): BreadcrumbItem[] {
  if (pathname === "/") return [];
  const segments = pathname.replace(/\/$/, "").split("/").filter(Boolean);
  const items: BreadcrumbItem[] = [];
  let path = "";
  for (const segment of segments) {
    path += `/${segment}`;
    const label =
      labelsByPath.get(path) ??
      ROUTE_LABELS[path] ??
      segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    items.push({ label, path });
  }
  return items;
}

export function Breadcrumbs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
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
  const items = buildBreadcrumbs(pathname, labelsByPath);

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
      <nav aria-label="Breadcrumb" className="mb-4 pl-8 md:pl-0">
        <ol className="flex items-center gap-1 text-sm text-muted-foreground">
          <li>
            <Link to="/" className="flex items-center gap-1 transition-colors hover:text-foreground" aria-label="Home">
              <Home className="size-3.5" />
            </Link>
          </li>
          {items.map((item, i) => {
            const isLast = i === items.length - 1;
            return (
              <li key={item.path} className="flex min-w-0 items-center gap-1">
                <ChevronRight className="size-3 shrink-0 text-muted-foreground/50" />
                {isLast ? (
                  <span className="truncate font-medium text-foreground" aria-current="page" title={item.label}>
                    {item.label}
                  </span>
                ) : (
                  <Link to={item.path} className="transition-colors hover:text-foreground">
                    {item.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
