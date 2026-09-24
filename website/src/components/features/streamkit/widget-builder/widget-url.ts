import { joinWidgetList, withoutEmptyVariables } from "~/lib/streamkit-list";

import type { WidgetConfig } from "./widget-config";

/** The widget's settings as its query string; `readWidgetSearch` reads each value back unchanged. */
export function widgetSearchParams(config: WidgetConfig): URLSearchParams | null {
  const params = new URLSearchParams();
  for (const [arg, value] of Object.entries(config.extraArgs)) {
    if (value) params.set(arg, value);
  }
  switch (config.widgetType) {
    case "box": {
      const { variables, labels = [], subtexts = [] } = withoutEmptyVariables(config);
      // Always written: without it the widget shows its five defaults, so an empty list means "no stats".
      params.set("vars", joinWidgetList(variables));
      if (labels.length > 0) params.set("labels", joinWidgetList(labels));
      if (subtexts.some(Boolean)) params.set("subtexts", joinWidgetList(subtexts));
      params.set("theme", config.theme);
      params.set("showHeader", config.showHeader.toString());
      params.set("showBranding", config.showBranding.toString());
      params.set("showOutline", config.showOutline.toString());
      params.set("showMatchHistory", config.showMatchHistory.toString());
      params.set("matchHistoryShowsToday", config.matchHistoryShowsToday.toString());
      params.set("numMatches", config.numMatches.toString());
      params.set("opacity", config.opacity.toString());
      return params;
    }
    case "raw":
      params.set("fontColor", config.fontColor);
      params.set("variable", config.variable);
      params.set("prefix", config.prefix);
      params.set("suffix", config.suffix);
      return params;
    default:
      return null;
  }
}

export function buildWidgetUrl(region: string, accountId: string, config: WidgetConfig): string | null {
  if (!accountId || !region || typeof window === "undefined") return null;
  const params = widgetSearchParams(config);
  if (!params) return null;

  const url = new URL(`${window.location.origin}/streamkit/widgets/${region}/${accountId}/${config.widgetType}`);
  url.search = params.toString();
  return url.toString();
}
