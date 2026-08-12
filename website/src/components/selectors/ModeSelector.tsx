import type { GameMode } from "./GameModeSelector";
import type { MatchMode } from "./MatchModeSelector";
import { StringSelector } from "./StringSelector";

/**
 * Game mode and match mode as one choice: Street Brawl is never played ranked, so the pairs
 * offered here are exactly the ones that can return data.
 */
export const MODE_CONFIG = {
  normal_all: { label: "All Normal", gameMode: "normal", matchMode: "ranked,unranked", supportsRank: true },
  normal_ranked: { label: "Normal Ranked", gameMode: "normal", matchMode: "ranked", supportsRank: true },
  normal_unranked: { label: "Normal Unranked", gameMode: "normal", matchMode: "unranked", supportsRank: true },
  street_brawl: { label: "Street Brawl", gameMode: "street_brawl", matchMode: "unranked", supportsRank: false },
} satisfies Record<string, { label: string; gameMode: GameMode; matchMode: MatchMode; supportsRank: boolean }>;

export type Mode = keyof typeof MODE_CONFIG;

export const DEFAULT_MODE: Mode = "normal_all";

const OPTIONS = Object.entries(MODE_CONFIG).map(([value, { label }]) => ({ value, label }));

export function ModeSelector({ value, onChange }: { value: Mode; onChange: (mode: Mode) => void }) {
  return (
    <StringSelector
      options={OPTIONS}
      onSelect={(v) => onChange(v as Mode)}
      selected={value}
      label="Mode"
      defaultValue={DEFAULT_MODE}
    />
  );
}
