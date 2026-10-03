import { type AnyRouter, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { StaleOverlay } from "~/components/patterns/states/StaleOverlay";

// A navigation that finishes sooner than this never washes the page out.
const SHOW_DELAY_MS = 150;

/**
 * Whether two paths show the same page: routes that render one component (an analytics section's views, each its own
 * URL) with the same params. Switching between them swaps a panel inside the page, which shows its own loading state.
 */
function isSamePage(router: AnyRouter, from: string, to: string) {
  const [, fromParams, fromRoute] = router.getMatchedRoutes(from);
  const [, toParams, toRoute] = router.getMatchedRoutes(to);
  const component = fromRoute?.options.component;
  if (!component || component !== toRoute?.options.component) return false;
  const keys = Object.keys(fromParams);
  return keys.length === Object.keys(toParams).length && keys.every((key) => fromParams[key] === toParams[key]);
}

/**
 * While a link to another page loads its code and data, the page being left stays on screen washed out and announced
 * busy, so a click on a slow connection shows that it was taken. Search-param changes (filters) and switches between
 * views of the same page (tabs) are not navigations here: their pages show their own loading states.
 */
export function PendingNavigation({ className, children }: { className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const pendingPath = useRouterState({
    select: (s) =>
      s.status === "pending" &&
      s.resolvedLocation &&
      s.location.pathname !== s.resolvedLocation.pathname &&
      !isSamePage(router, s.resolvedLocation.pathname, s.location.pathname)
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
