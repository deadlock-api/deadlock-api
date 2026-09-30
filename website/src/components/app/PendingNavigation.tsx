import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { StaleOverlay } from "~/components/patterns/states/StaleOverlay";

// A navigation that finishes sooner than this never washes the page out.
const SHOW_DELAY_MS = 150;

/**
 * While a link to another page loads its code and data, the page being left stays on screen washed out and announced
 * busy, so a click on a slow connection shows that it was taken. Search-param changes (filters) are not navigations
 * here: their pages show their own loading states.
 */
export function PendingNavigation({ className, children }: { className?: string; children: React.ReactNode }) {
  const pendingPath = useRouterState({
    select: (s) =>
      s.status === "pending" && s.resolvedLocation && s.location.pathname !== s.resolvedLocation.pathname
        ? s.location.pathname
        : null,
  });
  const [shownFor, setShownFor] = useState<string | null>(null);

  useEffect(() => {
    if (pendingPath === null) return;
    const timer = setTimeout(() => setShownFor(pendingPath), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pendingPath]);

  return (
    <StaleOverlay active={pendingPath !== null && shownFor === pendingPath} label="page" className={className}>
      {children}
    </StaleOverlay>
  );
}
