export type StatValue = string | number | null;

export type Stat = {
  variable: string;
  value: StatValue;
  label: string;
  icon?: string;
  color?: string;
  prefix?: string;
  suffix?: string;
  opacity?: number;
};

export type Theme = "dark" | "glass" | "light";

export type Region = "Europe" | "Asia" | "NAmerica" | "SAmerica" | "Oceania";

export type BoxWidgetProps = {
  region: Region;
  accountId: string;
  variables?: string[];
  labels?: string[];
  extraArgs?: Record<string, string>;
  theme?: Theme;
  showHeader?: boolean;
  refreshInterval?: number;
  showBranding?: boolean;
  showMatchHistory?: boolean;
  matchHistoryShowsToday?: boolean;
  numMatches?: number;
  opacity?: number;
};

type RGB = `rgb(${number}, ${number}, ${number})`;
type RGBA = `rgba(${number}, ${number}, ${number}, ${number})`;
type HEX = `#${string}`;
export type Color = RGB | RGBA | HEX;
export type RawWidgetProps = {
  region: Region;
  accountId: string;
  variable: string;
  prefix?: string;
  suffix?: string;
  extraArgs?: Record<string, string>;
  fontColor: Color;
  refreshInterval?: number;
};
