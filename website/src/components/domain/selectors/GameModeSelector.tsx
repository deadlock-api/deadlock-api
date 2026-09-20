import { parseAsStringLiteral } from "nuqs";

const GAME_MODES = ["normal", "street_brawl"] as const;
export type GameMode = (typeof GAME_MODES)[number];

export const parseAsGameMode = parseAsStringLiteral(GAME_MODES).withDefault("normal");
