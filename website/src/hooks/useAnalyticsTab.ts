import { useRouter, useRouterState } from "@tanstack/react-router";

import { analyticsTabFromPath, analyticsTabPath, type AnalyticsSection, type AnalyticsTab } from "~/lib/analytics-tabs";

export function useAnalyticsTab<S extends AnalyticsSection>(section: S) {
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const tab = analyticsTabFromPath(section, pathname);
  const setTab = (value: AnalyticsTab<S>) => {
    const location = router.latestLocation;
    const search = new URLSearchParams(location.searchStr);
    search.delete("tab");
    const query = search.toString();
    return router.navigate({
      href: analyticsTabPath(section, value) + (query ? `?${query}` : "") + (location.hash ? `#${location.hash}` : ""),
      resetScroll: false,
    });
  };
  return [tab, setTab] as const;
}
