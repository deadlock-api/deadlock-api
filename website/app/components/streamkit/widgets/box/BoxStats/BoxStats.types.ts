import type { Stat, Theme } from "~/types/streamkit/widget";

export interface BoxStatsProps {
  stats: Stat[];
  theme: Theme;
  loading: boolean;
}
