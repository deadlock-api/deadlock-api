import type {
  CorruptedItemImages,
  CorruptedPenalty,
  GenericData,
  ItemProperty,
  RawAbilityUpgradePropertyUpgrade,
} from "deadlock_api_client";

/**
 * Corrupted items (the City Never Sleeps update, build 6711+): the Broker swaps a tier 3 or 4 upgrade for a corrupted
 * version with the same item id, stronger stats and penalties rolled once per match. The API describes the bonuses on
 * the item (`corrupted_info`) and the penalties, art and Street Brawl round in the generic data.
 */

/** The first day with corrupted items in tracked matches (2026-09-29, UTC). */
export const CORRUPTED_ITEMS_SINCE_UNIX = Date.UTC(2026, 8, 29) / 1000;

/** How the item stats count corrupted purchases: `exclude` (the API default), `include` as the normal item, `only`. */
export const CORRUPTED_ITEM_MODES = ["exclude", "only", "include"] as const;
export type CorruptedItemMode = (typeof CORRUPTED_ITEM_MODES)[number];

/** Street Brawl hands every player a corruption after this round's item draft, when the generic data does not say. */
const DEFAULT_STREET_BRAWL_ROUND = 5;

/** The slice of the generic data the corrupted item views read; the rest (lanes, glitch settings) is left behind. */
export interface CorruptionData {
  penalties: CorruptedPenalty[];
  images: CorruptedItemImages | null;
  /** Extra souls by item tier (index = tier); all 0 at the update. */
  pricePerTier: number[];
  streetBrawlRound: number;
}

export function toCorruptionData(data: GenericData): CorruptionData {
  const streetBrawl = data.street_brawl as { corrupt_item_round?: unknown } | null | undefined;
  const round = streetBrawl?.corrupt_item_round;
  return {
    penalties: data.corrupted_penalties ?? [],
    images: data.corrupted_item_images ?? null,
    pricePerTier: data.item_corruption_price_per_tier ?? [],
    streetBrawlRound: typeof round === "number" && round > 0 ? round : DEFAULT_STREET_BRAWL_ROUND,
  };
}

/** "13m" → 13, "-40" → -40, 30 → 30; anything without a leading number → null. */
export function parseNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const match = /^\s*([+-]?\d*\.?\d+)/.exec(value ?? "");
  return match ? Number(match[1]) : null;
}

/** Up to two decimals, no trailing zeros: 3 → "3", 1.27 → "1.27", 2.50 → "2.5". */
function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** The unit printed after a value: the property's postfix, or the unit the raw value carries ("13m"). */
function unitOf(prop: ItemProperty): string {
  const postfix = (prop.postfix ?? "").trim();
  if (postfix) return postfix;
  // The API sends some values as numbers, although the generated client types them as strings.
  // oxlint-disable-next-line typescript/no-unnecessary-type-conversion -- see above
  return /^\s*[+-]?\d*\.?\d+\s*(\D*)$/.exec(String(prop.value ?? ""))?.[1]?.trim() ?? "";
}

/** A number as the game's tooltip prints it for this property: its sign rule, then the value and unit. */
export function formatPropertyNumber(prop: ItemProperty, value: number): string {
  const text = formatNumber(value) + unitOf(prop);
  const prefix = prop.prefix ?? "";
  if (prefix === "{s:sign}") return value < 0 ? text : `+${text}`;
  if (prefix && !text.startsWith(prefix)) return prefix + text;
  return text;
}

/** "LifeThreshold" → "Life Threshold": the name of a property the API sends no label for. */
export function humanizeName(name: string): string {
  return name
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
}

export interface CorruptedStat {
  name: string;
  label: string;
  /** The normal value as printed, or null when the item has no numeric value for it. */
  normal: string | null;
  /** The corrupted value as printed; the signed bonus ("+1") when there is no normal value to add it to. */
  corrupted: string;
}

/**
 * The corrupted bonuses of an item beside its normal values. The corrupted value is the normal one plus the bonus
 * (rounded to a whole number where the game rounds it). A bonus without a matching property is shown on its own.
 */
export function corruptedStats(
  properties: Record<string, ItemProperty> | null | undefined,
  upgrades: readonly RawAbilityUpgradePropertyUpgrade[],
): CorruptedStat[] {
  const rows: CorruptedStat[] = [];
  for (const upgrade of upgrades) {
    const bonus = parseNumber(upgrade.bonus);
    if (bonus === null || bonus === 0) continue;
    const prop: ItemProperty = properties?.[upgrade.name] ?? {};
    const base = parseNumber(prop.value);
    const label = prop.label || prop.postvalue_label || humanizeName(upgrade.name);
    const unitProp = { ...prop, value: prop.value ?? upgrade.bonus };
    if (base === null) {
      const bonusText = formatPropertyNumber({ ...unitProp, prefix: "{s:sign}" }, bonus);
      rows.push({ name: upgrade.name, label, normal: null, corrupted: bonusText });
      continue;
    }
    const raw = base + bonus;
    const corrupted = upgrade.round_corrupted_bonus ? Math.round(raw) : raw;
    rows.push({
      name: upgrade.name,
      label,
      normal: formatPropertyNumber(unitProp, base),
      corrupted: formatPropertyNumber(unitProp, corrupted),
    });
  }
  return rows;
}

export interface PenaltyEffect {
  label: string;
  /** Signed, with its unit: "-13%", "-350". */
  value: string;
}

export interface PenaltyRow {
  name: string;
  /** The effects the game shows, at this tier; never empty. */
  effects: PenaltyEffect[];
  /** Never rolled on this item (`excluded_penalties`). */
  excluded: boolean;
}

function formatPenaltyValue(value: number, postfix: string | null | undefined): string {
  const unit = (postfix ?? "").trim();
  const text = `${formatNumber(Math.abs(value))}${unit}`;
  return value < 0 ? `−${text}` : `+${text}`;
}

/**
 * The penalties an item of `tier` can roll, with their values at that tier (`bonus_per_tier` is indexed by tier).
 * Hidden effects and effects without a value at the tier are left out; a penalty left with none is too. Penalties
 * this item excludes come last, marked.
 */
export function penaltiesForTier(
  penalties: readonly CorruptedPenalty[],
  tier: number,
  excluded: readonly string[] = [],
): PenaltyRow[] {
  const excludedSet = new Set(excluded);
  const rows: PenaltyRow[] = [];
  for (const penalty of penalties) {
    const effects = penalty.effects
      .filter((effect) => effect.display)
      .map((effect) => ({ effect, value: effect.bonus_per_tier[tier] ?? 0 }))
      .filter(({ value }) => value !== 0)
      .map(({ effect, value }) => ({
        label: effect.label || humanizeName(effect.loc_token_override ?? effect.modifier_value),
        value: formatPenaltyValue(value, effect.postfix),
      }));
    if (effects.length === 0) continue;
    rows.push({ name: penalty.name, effects, excluded: excludedSet.has(penalty.name) });
  }
  return rows.sort((a, b) => Number(a.excluded) - Number(b.excluded));
}

/** The localized name of a penalty ("Ability Range"), from its first shown effect, or its internal name spelled out. */
export function penaltyLabel(penalties: readonly CorruptedPenalty[], name: string): string {
  const penalty = penalties.find((candidate) => candidate.name === name);
  const effect = penalty?.effects.find((candidate) => candidate.display && candidate.label);
  return effect?.label ?? humanizeName(name);
}
