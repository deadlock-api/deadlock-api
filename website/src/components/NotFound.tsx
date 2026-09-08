import { Link } from "@tanstack/react-router";
import { ArrowLeft, Home, SearchIcon } from "lucide-react";

import { useQuickSearch } from "~/components/QuickSearch";
import { Button } from "~/components/ui/button";

const suggestions = [
  { to: "/heroes", label: "Hero Stats" },
  { to: "/items", label: "Item Stats" },
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/games", label: "Games" },
];

export function NotFound() {
  const openSearch = useQuickSearch();
  return (
    <>
      <title>Page Not Found | Deadlock API</title>
      <meta name="robots" content="noindex, nofollow" />
      <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-7xl font-bold tracking-tight text-primary">404</h1>
          <h2 className="text-2xl font-semibold">Page Not Found</h2>
          <p className="max-w-md text-muted-foreground">
            The page you're looking for doesn't exist or may have been moved.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/">
            <Button variant="default" className="gap-2">
              <Home className="size-4" />
              Go Home
            </Button>
          </Link>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              if (typeof window !== "undefined") window.history.back();
            }}
          >
            <ArrowLeft className="size-4" />
            Go Back
          </Button>
          <Button variant="outline" className="gap-2" onClick={openSearch}>
            <SearchIcon className="size-4" />
            Search the site
          </Button>
        </div>

        <div className="pt-4">
          <p className="mb-3 text-sm text-muted-foreground">Or try one of these:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {suggestions.map((s) => (
              <Link
                key={s.to}
                to={s.to}
                className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:border-primary/40 hover:text-primary"
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
