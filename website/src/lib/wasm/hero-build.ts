import type { WasmModule } from "./module";

/**
 * Deadlock's `CMsgHeroBuild`, as the `hero-build` module (`wasm/hero-build`) trades it: proto field names, absent
 * fields `null`. Every field must be present when encoding.
 */
export interface HeroBuild {
  hero_build_id: number | null;
  hero_id: number | null;
  author_account_id: number | null;
  last_updated_timestamp: number | null;
  name: string | null;
  description: string | null;
  language: number | null;
  version: number | null;
  origin_build_id: number | null;
  details: HeroBuildDetails | null;
  tags: number[];
  development_build: boolean | null;
  publish_timestamp: number | null;
}

export interface HeroBuildDetails {
  /** The build's item groups, in order: by default early, mid and late game. */
  mod_categories: HeroBuildModCategory[];
  ability_order: { currency_changes: HeroBuildCurrencyChange[] } | null;
}

export interface HeroBuildModCategory {
  mods: HeroBuildMod[];
  /** Plain text, or a localization token such as `#Citadel_HeroBuilds_EarlyGame`. */
  name: string | null;
  description: string | null;
  /** The group's size in the game's build editor. */
  width: number | null;
  height: number | null;
  optional: boolean | null;
}

export interface HeroBuildMod {
  /** The item's id. */
  ability_id: number | null;
  annotation: string | null;
  required_flex_slots: number | null;
  sell_priority: number | null;
  /** The ability an imbued item is set to. */
  imbue_target_ability_id: number | null;
}

/** A step of the skill order: an ability unlocked or upgraded. */
export interface HeroBuildCurrencyChange {
  ability_id: number | null;
  /** `ABILITY_UNLOCK` or `ABILITY_POINTS`. */
  currency_type: number | null;
  /** What the step costs, negative: 1 for an unlock, 1, 2 or 5 points for an ability's three upgrades. */
  delta: number | null;
  annotation: string | null;
}

export const ABILITY_POINTS = 1;
export const ABILITY_UNLOCK = 2;

export interface HeroBuildCodec {
  /** Reads a build code copied in game; throws a `WasmCallError` for text that is not one. */
  decode: (code: string) => HeroBuild;
  /** Writes a build as a code the game accepts on paste. */
  encode: (build: HeroBuild) => string;
}

export function heroBuildCodec(module: WasmModule<"decode" | "encode">): HeroBuildCodec {
  return {
    decode: (code) => JSON.parse(module.call("decode", code)) as HeroBuild,
    encode: (build) => module.call("encode", JSON.stringify(build)),
  };
}
