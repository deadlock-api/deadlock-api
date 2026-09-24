import type { StatFormat } from "~/lib/stat-format";

export const ITEM_TABLE_TRENDS = {
  winRate: { label: "Win Rate", format: "percent" },
  pickRate: { label: "Pick Rate", format: "percent" },
} as const satisfies Record<string, { label: string; format: StatFormat }>;

export type ItemTableTrend = keyof typeof ITEM_TABLE_TRENDS;
