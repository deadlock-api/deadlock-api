import { ChevronRight, Home } from "lucide-react";
import { Link, useLocation } from "react-router";

const ROUTE_LABELS: Record<string, string> = {
  heroes: "Hero Stats",
  items: "Item Stats",
  abilities: "Ability Stats",
  leaderboard: "Leaderboard",
  "badge-distribution": "Rank Distribution",
  "game-stats": "Game Stats",
  heatmap: "Kill Heatmap",
  "player-scoreboard": "Player Scoreboard",
  chat: "AI Chat",
  streamkit: "Stream Kit",
  "ingest-cache": "Data Ingest",
  "data-privacy": "Data Privacy",
  patron: "Prioritized Fetching",
};

interface BreadcrumbItem {
  label: string;
  path: string;
}

function buildBreadcrumbs(pathname: string): BreadcrumbItem[] {
  if (pathname === "/") return [];
  const segments = pathname.replace(/\/$/, "").split("/").filter(Boolean);
  const items: BreadcrumbItem[] = [];
  let path = "";
  for (const segment of segments) {
    path += `/${segment}`;
    const label = ROUTE_LABELS[segment] ?? segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    items.push({ label, path });
  }
  return items;
}

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const items = buildBreadcrumbs(pathname);

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
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex items-center gap-1 text-sm text-muted-foreground">
          <li>
            <Link to="/" className="flex items-center gap-1 hover:text-foreground transition-colors" aria-label="Home">
              <Home className="size-3.5" />
            </Link>
          </li>
          {items.map((item, i) => {
            const isLast = i === items.length - 1;
            return (
              <li key={item.path} className="flex items-center gap-1">
                <ChevronRight className="size-3 text-muted-foreground/50" />
                {isLast ? (
                  <span className="text-foreground font-medium" aria-current="page">
                    {item.label}
                  </span>
                ) : (
                  <Link to={item.path} className="hover:text-foreground transition-colors">
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
