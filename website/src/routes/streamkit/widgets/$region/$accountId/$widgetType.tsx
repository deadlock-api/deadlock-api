import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { BoxWidget } from "~/components/streamkit/widgets/box";
import { RawWidget } from "~/components/streamkit/widgets/raw";
import { CACHE_DURATIONS } from "~/constants/cache";
import { API_ORIGIN } from "~/lib/constants";
import { snakeToPretty } from "~/lib/utils";
import { queryKeys } from "~/queries/query-keys";
import type { Color } from "~/types/general";
import type { Region, Theme } from "~/types/streamkit/widget";

export const Route = createFileRoute("/streamkit/widgets/$region/$accountId/$widgetType")({
  validateSearch: (search: Record<string, unknown>): Record<string, string> =>
    Object.fromEntries(Object.entries(search).filter(([, value]) => typeof value === "string")) as Record<
      string,
      string
    >,
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
  const search = Route.useSearch() as Record<string, string | undefined>;
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
      const variables = search.vars?.split(",");
      const labels = search.labels?.split(",") ?? variables?.map(snakeToPretty);
      const theme = (search.theme ?? "dark") as Theme;
      const showHeader = search.showHeader !== "false";
      const showBranding = search.showBranding !== "false";
      const showMatchHistory = search.showMatchHistory !== "false";
      const matchHistoryShowsToday = search.matchHistoryShowsToday !== "false";
      const parsedNumMatches = Number.parseInt(search.numMatches ?? "10", 10);
      const numMatches = Math.max(1, Math.min(20, Number.isNaN(parsedNumMatches) ? 10 : parsedNumMatches));
      const parsedOpacity = Number.parseInt(search.opacity ?? "100", 10);
      const opacity = Math.max(0, Math.min(100, Number.isNaN(parsedOpacity) ? 100 : parsedOpacity));
      const reserved = new Set([
        "vars",
        "labels",
        "theme",
        "showHeader",
        "showBranding",
        "numMatches",
        "matchHistoryShowsToday",
        "showMatchHistory",
        "opacity",
      ]);
      const extraArgs = Object.fromEntries(
        Object.entries(search).filter(([key, value]) => !reserved.has(key) && typeof value === "string"),
      ) as Record<string, string>;

      return (
        <BoxWidget
          region={region as Region}
          accountId={accountId}
          variables={variables}
          labels={labels}
          extraArgs={extraArgs}
          theme={theme}
          showHeader={showHeader}
          showBranding={showBranding}
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
      const reserved = new Set(["variable", "fontColor"]);
      const extraArgs = Object.fromEntries(
        Object.entries(search).filter(([key, value]) => !reserved.has(key) && typeof value === "string"),
      ) as Record<string, string>;
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
