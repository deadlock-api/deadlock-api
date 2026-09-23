import { joinWidgetList, withoutEmptyVariables } from "~/lib/streamkit-list";

import type { WidgetConfig } from "./widget-config";

export function buildWidgetUrl(region: string, accountId: string, config: WidgetConfig): string | null {
  if (!accountId || !region || typeof window === "undefined") return null;

  const url = new URL(`${window.location.origin}/streamkit/widgets/${region}/${accountId}/${config.widgetType}`);
  for (const [arg, value] of Object.entries(config.extraArgs)) {
    if (value) url.searchParams.set(arg, value);
  }
  switch (config.widgetType) {
    case "box": {
      const { variables, labels = [], subtexts = [] } = withoutEmptyVariables(config);
      if (variables.length > 0) url.searchParams.set("vars", joinWidgetList(variables));
      if (labels.length > 0) url.searchParams.set("labels", joinWidgetList(labels));
      if (subtexts.some(Boolean)) url.searchParams.set("subtexts", joinWidgetList(subtexts));
      url.searchParams.set("theme", config.theme);
      url.searchParams.set("showHeader", config.showHeader.toString());
      url.searchParams.set("showBranding", config.showBranding.toString());
      url.searchParams.set("showOutline", config.showOutline.toString());
      url.searchParams.set("showMatchHistory", config.showMatchHistory.toString());
      url.searchParams.set("matchHistoryShowsToday", config.matchHistoryShowsToday.toString());
      url.searchParams.set("numMatches", config.numMatches.toString());
      url.searchParams.set("opacity", config.opacity.toString());
      return url.toString();
    }
    case "raw":
      url.searchParams.set("fontColor", config.fontColor);
      url.searchParams.set("variable", config.variable);
      url.searchParams.set("prefix", config.prefix);
      url.searchParams.set("suffix", config.suffix);
      return url.toString();
    default:
      return null;
  }
}
