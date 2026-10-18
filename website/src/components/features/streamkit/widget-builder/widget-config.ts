import type { Color } from "~/types/general";
import type { Theme } from "~/types/streamkit/widget";

export const widgetTypes: string[] = ["box", "raw"];

export const themes: { value: Theme; label: string }[] = [
  { value: "dark", label: "Dark Theme" },
  { value: "light", label: "Light Theme" },
  { value: "glass", label: "Glass Theme" },
];

export type PreviewBackgroundColor = Color;

/** One stat of the box widget: its variable, its label and its optional second line. `id` keys the builder row. */
export interface WidgetRow {
  id: number;
  variable: string;
  label: string;
  subtext: string;
}

export function widgetRows(variables: readonly string[], labels: readonly string[], subtexts: readonly string[]) {
  return variables.map((variable, id): WidgetRow => ({
    id,
    variable,
    label: labels[id] ?? "",
    subtext: subtexts[id] ?? "",
  }));
}

/** The rows as the parallel lists the widget URL carries. */
export function widgetColumns(rows: readonly WidgetRow[]) {
  return {
    variables: rows.map((row) => row.variable),
    labels: rows.map((row) => row.label),
    subtexts: rows.map((row) => row.subtext),
  };
}

export interface WidgetConfig {
  widgetType: string;
  theme: Theme;
  rows: WidgetRow[];
  variable: string;
  prefix: string;
  suffix: string;
  fontColor: Color;
  extraArgs: { [key: string]: string };
  showHeader: boolean;
  showBranding: boolean;
  showOutline: boolean;
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
