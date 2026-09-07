import { parseAsStringLiteral } from "nuqs";

/** The analytics endpoints take a comma separated `match_mode`; these are the values worth offering. */
export const MATCH_MODES = ["ranked,unranked", "ranked", "unranked"] as const;
export type MatchMode = (typeof MATCH_MODES)[number];

export const DEFAULT_MATCH_MODE: MatchMode = "ranked,unranked";
export const parseAsMatchMode = parseAsStringLiteral(MATCH_MODES).withDefault(DEFAULT_MATCH_MODE);
