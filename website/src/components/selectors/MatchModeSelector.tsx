import { parseAsStringLiteral } from "nuqs";

import { StringSelector } from "./StringSelector";

/** The analytics endpoints take a comma separated `match_mode`; these are the values worth offering. */
export const MATCH_MODES = ["ranked,unranked", "ranked", "unranked"] as const;
export type MatchMode = (typeof MATCH_MODES)[number];

export const DEFAULT_MATCH_MODE: MatchMode = "ranked,unranked";
export const parseAsMatchMode = parseAsStringLiteral(MATCH_MODES).withDefault(DEFAULT_MATCH_MODE);

export const MATCH_MODE_LABELS: Record<MatchMode, string> = {
  "ranked,unranked": "Ranked & Unranked",
  ranked: "Ranked only",
  unranked: "Unranked only",
};

const OPTIONS = MATCH_MODES.map((value) => ({ value, label: MATCH_MODE_LABELS[value] }));

export function MatchModeSelector({ value, onChange }: { value: MatchMode; onChange: (mode: MatchMode) => void }) {
  return (
    <StringSelector
      options={OPTIONS}
      onSelect={(v) => onChange(v as MatchMode)}
      selected={value}
      label="Matches"
      defaultValue={DEFAULT_MATCH_MODE}
    />
  );
}
