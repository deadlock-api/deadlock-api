import type { Theme } from "~/types/streamkit/widget";

export interface Stat {
  variable: string;
  value: string | number | null;
  label: string;
  subtext?: string;
  /** What an image stat shows, in words (the rank's name for `rank_img`). */
  imageAlt?: string;
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
