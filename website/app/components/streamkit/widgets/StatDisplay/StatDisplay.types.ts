import type { Theme } from "~/types/streamkit/widget";

export interface Stat {
  variable: string;
  value: string | number | null;
  label: string;
  icon?: string;
  color?: string;
  prefix?: string;
  suffix?: string;
  opacity?: number;
}

export interface StatDisplayProps {
  stat: Stat;
  theme?: Theme;
  className?: string;
}
