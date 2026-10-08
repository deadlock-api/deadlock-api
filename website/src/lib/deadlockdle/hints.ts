import type { Ability, Hero, Upgrade } from "deadlock_api_client";

import { capitalize } from "~/lib/format";
import { snakeToPretty } from "~/lib/utils";

import { redactName } from "./redact";

/** One hint of a guessing round, revealed after each wrong guess. */
export interface Hint {
  label: string;
  value: string;
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "");
}

function truncate(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

/** Guess the Hero: type, a base stat, redacted lore, the weapon, then playstyle (or role, a second stat, complexity). */
export function heroHints(hero: Hero): Hint[] {
  const heroType = hero.hero_type ? capitalize(hero.hero_type) : "Unknown";

  const startingStats = Object.entries(hero.starting_stats) as [string, { value: number }][];
  const health = startingStats.find(([key]) => key === "max_health") ?? startingStats[0];
  const statHint = health ? `Base ${snakeToPretty(health[0])}: ${health[1].value}` : "No stats available";

  const redact = (text: string) => redactName(stripHtml(text), hero.name);
  const lore = hero.description?.lore;
  const loreHint = lore ? truncate(redact(lore), 100) : "No lore available";

  const playstyle = hero.description?.playstyle;
  const role = hero.description?.role;
  const secondStat = startingStats.find(([key]) => key === "weapon_power" || key === "sprint_speed");
  const lastHint: Hint = playstyle
    ? { label: "PLAYSTYLE", value: redact(playstyle) }
    : role
      ? { label: "ROLE", value: redact(role) }
      : secondStat
        ? { label: "STAT 2", value: `Base ${snakeToPretty(secondStat[0])}: ${secondStat[1].value}` }
        : { label: "COMPLEXITY", value: `Complexity: ${hero.complexity}` };

  return [
    { label: "TYPE", value: heroType },
    { label: "STAT", value: statHint },
    { label: "LORE", value: loreHint },
    { label: "WEAPON", value: hero.gun_tag ?? "Unknown" },
    lastHint,
  ];
}

type ItemProperties = Record<string, { value?: unknown; label?: string | null; postfix?: string | null }>;

/** An item's first labelled property, numeric ones first, with its unit: "Cooldown: 23s". */
export function itemPropertyHint(properties: ItemProperties | null | undefined): string {
  if (!properties) return "No properties available";

  // The unit ("s", "m", "%") comes separately; without it "Cooldown: 23" reads as a bare number.
  const withUnit = (prop: { value?: unknown; postfix?: string | null }) => {
    const value = String(prop.value);
    const postfix = (prop.postfix ?? "").trim();
    return value.endsWith(postfix) ? value : value + postfix;
  };

  const labelled = Object.values(properties).filter((prop) => prop.label && prop.value != null);
  const prop = labelled.find((candidate) => typeof candidate.value === "number") ?? labelled[0];
  return prop ? `${prop.label}: ${withUnit(prop)}` : "No properties available";
}

/** Guess the Item: slot, active or passive, a property, then the tier. */
export function itemHints(item: Upgrade): Hint[] {
  return [
    { label: "SLOT", value: capitalize(item.item_slot_type) },
    { label: "ACTIVATION", value: item.is_active_item ? "Active" : "Passive" },
    { label: "PROPERTY", value: itemPropertyHint(item.properties) },
    { label: "TIER", value: `Tier ${item.item_tier}` },
  ];
}

/**
 * Slots in a hero's `items` map holding their four real abilities, in kit order. Every other `ability_*` slot is a
 * movement ability (jump, slide, zipline, dash, ...) shared across all heroes, and the assets expose those with empty
 * or raw-localization-key names.
 */
const ABILITY_SLOTS = ["signature1", "signature2", "signature3", "signature4"] as const;
const ULTIMATE_SLOT = "signature4";

/** An ability that can be the answer of Guess the Ability, with its hero. */
export interface GuessableAbility {
  id: number;
  name: string;
  ability: Ability;
  hero: Hero;
  typeLabel: string;
}

/** Every named ability with an icon in the playable heroes' kits. */
export function buildGuessableAbilities(abilities: Ability[], playableHeroes: Hero[]): GuessableAbility[] {
  const byClassName = new Map(abilities.map((ability) => [ability.class_name, ability]));
  const results: GuessableAbility[] = [];
  for (const hero of playableHeroes) {
    for (const slot of ABILITY_SLOTS) {
      const ability = byClassName.get(hero.items[slot]);
      if (!ability?.name?.trim()) continue;
      if (!ability.image && !ability.image_webp) continue;
      results.push({
        id: ability.id,
        name: ability.name,
        ability,
        hero,
        typeLabel: slot === ULTIMATE_SLOT ? "Ultimate" : "Signature Ability",
      });
    }
  }
  return results;
}

/** Guess the Ability: signature or ultimate, the hero's type, the hero, then the redacted description. */
export function abilityHints({ ability, hero, typeLabel }: GuessableAbility): Hint[] {
  const heroType = hero.hero_type ? capitalize(hero.hero_type) : "Unknown";
  // The description often names the ability itself ("If you perform Ground Strike while airborne").
  const description = redactName(stripHtml(ability.description?.desc ?? ""), ability.name);
  return [
    { label: "TYPE", value: typeLabel },
    { label: "HERO TYPE", value: `${heroType} hero` },
    { label: "HERO", value: hero.name },
    { label: "DESC", value: description ? truncate(description, 120) : "No description available" },
  ];
}
