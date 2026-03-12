import type { Color } from "~/types/general";
import type { Theme } from "~/types/streamkit/widget";

export const widgetTypes: string[] = ["box", "raw"];

export const themes: { value: Theme; label: string }[] = [
  { value: "dark", label: "Dark Theme" },
  { value: "light", label: "Light Theme" },
  { value: "glass", label: "Glass Theme" },
];

export type PreviewBackgroundColor = Color;

export interface WidgetConfig {
  widgetType: string;
  theme: Theme;
  variables: string[];
  variable: string;
  prefix: string;
  suffix: string;
  fontColor: Color;
  labels: string[];
  extraArgs: { [key: string]: string };
  showHeader: boolean;
  showBranding: boolean;
  showMatchHistory: boolean;
  matchHistoryShowsToday: boolean;
  numMatches: number;
  opacity: number;
  previewBackgroundImage: boolean;
  previewBackgroundColor: PreviewBackgroundColor;
}

export type WidgetConfigAction = Partial<WidgetConfig>;

export function widgetConfigReducer(state: WidgetConfig, action: WidgetConfigAction): WidgetConfig {
  return { ...state, ...action };
}
