import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { MetaFunction } from "react-router";
import { useParams, useSearchParams } from "react-router";
import { BoxWidget } from "~/components/streamkit/widgets/box";
import { RawWidget } from "~/components/streamkit/widgets/raw";
import { snakeToPretty } from "~/lib/utils";
import type { Color, Region, Theme } from "~/types/streamkit/widget";

export const meta: MetaFunction = () => {
  return [{ title: "Deadlock Stats Widget" }, { name: "description", content: "Stats widget powered by Deadlock API" }];
};

export default function Widget() {
  const { region, accountId, widgetType } = useParams();
  const [version, setVersion] = useState<number | null>(null);
  const [searchParams] = useSearchParams();

  const { data: fetchedVersion, error: versionError } = useQuery<number>({
    queryKey: ["version", widgetType],
    queryFn: () =>
      fetch("https://api.deadlock-api.com/v1/commands/widgets/versions")
        .then((res) => res.json())
        .then((data) => (widgetType ? data[widgetType] : data)),
    staleTime: (5 * 60 - 10) * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!fetchedVersion || versionError) return;
    if (version === null) setVersion(fetchedVersion);
    else if (fetchedVersion > version) window.location.reload();
  }, [fetchedVersion, version, versionError]);

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
      const variables = searchParams.get("vars")?.split(",");
      const labels = searchParams.get("labels")?.split(",") ?? variables?.map(snakeToPretty);
      const theme = (searchParams.get("theme") ?? "dark") as Theme;
      const showHeader = searchParams.get("showHeader") !== "false";
      const showBranding = searchParams.get("showBranding") !== "false";
      const showMatchHistory = searchParams.get("showMatchHistory") !== "false";
      const matchHistoryShowsToday = searchParams.get("matchHistoryShowsToday") !== "false";
      const numMatches = Number.parseInt(searchParams.get("numMatches") ?? "10", 10);
      const opacity = Number.parseInt(searchParams.get("opacity") ?? "100", 10);
      const extraArgs = Object.fromEntries(
        Array.from(searchParams.entries()).filter(
          ([key]) =>
            ![
              "vars",
              "labels",
              "theme",
              "showHeader",
              "showBranding",
              "numMatches",
              "matchHistoryShowsToday",
              "showMatchHistory",
              "opacity",
            ].includes(key),
        ),
      );

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
      const variable = searchParams.get("variable");
      const prefix = searchParams.get("prefix") ?? "";
      const suffix = searchParams.get("suffix") ?? "";
      const fontColor = (searchParams.get("fontColor") as Color) ?? "#FFFFFF";
      const extraArgs = Object.fromEntries(
        Array.from(searchParams.entries()).filter(([key]) => !["variable", "fontColor"].includes(key)),
      );
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
