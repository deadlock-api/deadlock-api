import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useLocation, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { BoxWidget } from "~/components/features/streamkit/widgets/box";
import { RawWidget } from "~/components/features/streamkit/widgets/raw";
import { CACHE_DURATIONS } from "~/constants/cache";
import { API_ORIGIN } from "~/lib/constants";
import { splitWidgetList, withoutEmptyVariables } from "~/lib/streamkit-list";
import { readWidgetFlag, readWidgetInt, readWidgetSearch } from "~/lib/streamkit-widget-search";
import { snakeToPretty } from "~/lib/utils";
import { queryKeys } from "~/queries/query-keys";
import type { Color } from "~/types/general";
import type { Region, Theme } from "~/types/streamkit/widget";

// Only these are known; anything else in the URL is not a theme, and the overlay on stream must not crash on it.
const THEMES: readonly Theme[] = ["dark", "glass", "light"];

export const Route = createFileRoute("/streamkit/widgets/$region/$accountId/$widgetType")({
  head: () => ({
    meta: [
      { title: "Deadlock Stats Widget" },
      { name: "description", content: "Stats widget powered by Deadlock API" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Widget,
});

function Widget() {
  const { region, accountId, widgetType } = Route.useParams();
  const router = useRouter();
  // The raw query string, not the router's parsed search: its JSON parsing mangles prefixes, suffixes and labels
  // ("1.50 " became 1.5). The route has no validateSearch, so the router also leaves the URL as it was written.
  const rawSearch = useLocation({ select: () => router.history.location.search });
  const search = readWidgetSearch(rawSearch);
  const initialVersionRef = useRef<number | null>(null);

  const { data: fetchedVersion, error: versionError } = useQuery<number>({
    queryKey: queryKeys.streamkit.version(widgetType),
    queryFn: () =>
      fetch(`${API_ORIGIN}/v1/commands/widgets/versions`)
        .then((res) => res.json())
        .then((data) => (widgetType ? data[widgetType] : data)),
    staleTime: (5 * 60 - 10) * 1000,
    refetchInterval: CACHE_DURATIONS.FIVE_MINUTES,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!fetchedVersion || versionError) return;
    if (initialVersionRef.current === null) {
      initialVersionRef.current = fetchedVersion;
      return;
    }
    if (fetchedVersion > initialVersionRef.current) window.location.reload();
  }, [fetchedVersion, versionError]);

  useEffect(() => {
    document.body.style.zoom = "3";
    document.body.style.backgroundColor = "transparent";
    document.documentElement.style.backgroundColor = "transparent";
    document.body.style.backgroundImage = "none";
    return () => {
      document.body.style.zoom = "";
      document.documentElement.style.backgroundColor = "";
      document.body.style.backgroundColor = "";
      document.body.style.backgroundImage = "";
    };
  }, []);

  if (!region || !accountId) {
    return <div className="text-red-500">Region and Account ID are required</div>;
  }

  switch (widgetType) {
    case "box": {
      // An empty `vars=` is a widget with no stats; only a URL without `vars` falls back to the defaults.
      const columns =
        search.vars !== undefined
          ? withoutEmptyVariables({
              variables: splitWidgetList(search.vars),
              labels: search.labels === undefined ? undefined : splitWidgetList(search.labels),
              subtexts: search.subtexts === undefined ? undefined : splitWidgetList(search.subtexts),
            })
          : undefined;
      const variables = columns?.variables;
      const labels = columns?.labels ?? variables?.map(snakeToPretty);
      const subtexts = columns?.subtexts;
      // An edited URL ("?theme=Dark") must not crash the overlay on stream: unknown themes fall back to dark.
      const theme: Theme = THEMES.includes(search.theme as Theme) ? (search.theme as Theme) : "dark";
      const showHeader = readWidgetFlag(search.showHeader, true);
      const showBranding = readWidgetFlag(search.showBranding, true);
      const showOutline = readWidgetFlag(search.showOutline, true);
      const showMatchHistory = readWidgetFlag(search.showMatchHistory, true);
      const matchHistoryShowsToday = readWidgetFlag(search.matchHistoryShowsToday, true);
      const numMatches = readWidgetInt(search.numMatches, 10, 1, 20);
      const opacity = readWidgetInt(search.opacity, 100, 0, 100);
      const reserved = new Set([
        "vars",
        "labels",
        "subtexts",
        "theme",
        "showHeader",
        "showBranding",
        "showOutline",
        "numMatches",
        "matchHistoryShowsToday",
        "showMatchHistory",
        "opacity",
      ]);
      const extraArgs = Object.fromEntries(Object.entries(search).filter(([key]) => !reserved.has(key)));

      return (
        <BoxWidget
          region={region as Region}
          accountId={accountId}
          variables={variables}
          labels={labels}
          subtexts={subtexts}
          extraArgs={extraArgs}
          theme={theme}
          showHeader={showHeader}
          showBranding={showBranding}
          showOutline={showOutline}
          showMatchHistory={showMatchHistory}
          matchHistoryShowsToday={matchHistoryShowsToday}
          numMatches={numMatches}
          opacity={opacity}
        />
      );
    }
    case "raw": {
      const variable = search.variable;
      const prefix = search.prefix ?? "";
      const suffix = search.suffix ?? "";
      const fontColor = (search.fontColor as Color) ?? "#FFFFFF";
      // Display settings of the widget itself; everything else is an argument of the variable.
      const reserved = new Set(["variable", "fontColor", "prefix", "suffix"]);
      const extraArgs = Object.fromEntries(Object.entries(search).filter(([key]) => !reserved.has(key)));
      if (!variable) return <div className="text-red-500">Variable is required</div>;
      return (
        <RawWidget
          region={region as Region}
          accountId={accountId}
          variable={variable}
          fontColor={fontColor}
          extraArgs={extraArgs}
          prefix={prefix}
          suffix={suffix}
        />
      );
    }
    default:
      return <div className="text-red-500">Invalid widget type</div>;
  }
}
