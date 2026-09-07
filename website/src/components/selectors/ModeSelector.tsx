import { FilterToggleCell } from "~/components/Filter/FilterCell";

import type { GameMode } from "./GameModeSelector";
import type { MatchMode } from "./MatchModeSelector";

/**
 * Game mode and match mode as one choice: Street Brawl is never played ranked, so the pairs
 * offered here are exactly the ones that can return data.
 */
export const MODE_CONFIG = {
  normal_all: {
    label: "All",
    gameMode: "normal",
    matchMode: "ranked,unranked",
    supportsRank: true,
  },
  normal_ranked: {
    label: "Ranked",
    gameMode: "normal",
    matchMode: "ranked",
    supportsRank: true,
  },
  normal_unranked: {
    label: "Unranked",
    gameMode: "normal",
    matchMode: "unranked",
    supportsRank: true,
  },
  street_brawl: {
    label: "Brawl",
    gameMode: "street_brawl",
    matchMode: "unranked",
    supportsRank: false,
  },
} satisfies Record<string, { label: string; gameMode: GameMode; matchMode: MatchMode; supportsRank: boolean }>;

export type Mode = keyof typeof MODE_CONFIG;

export const DEFAULT_MODE: Mode = "normal_all";

const OPTIONS = (Object.keys(MODE_CONFIG) as Mode[]).map((value) => ({ value, label: MODE_CONFIG[value].label }));

export function ModeSelector({ value, onChange }: { value: Mode; onChange: (mode: Mode) => void }) {
  return (
    <FilterToggleCell
      label="Mode"
      value={value}
      onValueChange={onChange}
      options={OPTIONS}
      active={value !== DEFAULT_MODE}
    />
  );
}
