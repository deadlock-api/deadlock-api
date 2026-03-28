import type { Theme } from "~/types/streamkit/widget";

export interface StatTextProps {
  label: string;
  value: string | number | null;
  prefix?: string;
  suffix?: string;
  theme: Theme;
}
