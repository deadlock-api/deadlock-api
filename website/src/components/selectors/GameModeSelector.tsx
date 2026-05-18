import { parseAsStringLiteral } from "nuqs";

import { StringSelector } from "./StringSelector";

export const GAME_MODES = ["normal", "street_brawl"] as const;
export type GameMode = (typeof GAME_MODES)[number];

export const parseAsGameMode = parseAsStringLiteral(GAME_MODES).withDefault("normal");

const GAME_MODE_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "street_brawl", label: "Street Brawl" },
];

export function GameModeSelector({ value, onChange }: { value: GameMode; onChange: (mode: GameMode) => void }) {
  return (
    <StringSelector
      options={GAME_MODE_OPTIONS}
      onSelect={(v) => onChange(v as GameMode)}
      selected={value}
      label="Mode"
      defaultValue="normal"
    />
  );
}
