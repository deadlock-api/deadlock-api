import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation } from "react-router";

import { prefetchNeighbors } from "~/lib/route-prefetch";

export function useRoutePrefetchIdle() {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    const run = () => prefetchNeighbors(pathname, queryClient);

    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(run, { timeout: 3000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timeout = window.setTimeout(run, 1500);
    return () => window.clearTimeout(timeout);
  }, [pathname, queryClient]);
}
