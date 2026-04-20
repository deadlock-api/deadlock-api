import type { AbilityV2, HeroV2, UpgradeV2 } from "assets_deadlock_api_client/api";

import { filterPlayableHeroes, filterShopableItems } from "~/queries/asset-queries";

import { seededPick, seededShuffle } from "./seed";

export interface TriviaQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  category: string;
}

type NpcUnit = {
  class_name: string;
  max_health?: number | null;
  gold_reward?: number | null;
  id: number;
};

type AbilityWithHero = {
  ability: AbilityV2;
  heroName: string;
};

const HERO_TYPES = ["Assassin", "Brawler", "Marksman", "Mystic"] as const;
const ITEM_TIERS = ["Tier 1", "Tier 2", "Tier 3", "Tier 4"] as const;
const ITEM_SLOTS = ["Weapon", "Spirit", "Vitality"] as const;
const ABILITY_TYPES = ["Signature", "Ultimate", "Innate"] as const;
const VALID_ABILITY_TYPES = new Set(["signature", "ultimate", "innate"]);

const HERO_STAT_KEYS = [
  { key: "max_health", label: "Max Health" },
  { key: "light_melee_damage", label: "Light Melee Damage" },
  { key: "heavy_melee_damage", label: "Heavy Melee Damage" },
  { key: "weapon_power", label: "Weapon Power" },
  { key: "base_health_regen", label: "Base Health Regen" },
  { key: "stamina", label: "Stamina" },
  { key: "max_move_speed", label: "Max Move Speed" },
  { key: "sprint_speed", label: "Sprint Speed" },
  { key: "reload_speed", label: "Reload Speed" },
] as const;

type QuestionGenerator = (
  heroes: HeroV2[],
  items: UpgradeV2[],
  npcUnits: NpcUnit[],
  abilities: AbilityWithHero[],
  rng: () => number,
) => TriviaQuestion | null;

/** Format NPC class_name into readable form: "npc_boss_tier1" -> "Boss Tier 1" */
function formatNpcName(className: string): string {
  return className
    .replace(/^npc_/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/(\d+)/g, " $1")
    .replace(/\s+/g, " ")
    .trim();
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getHeroStat(hero: HeroV2, key: string): number | null {
  const stats = hero.starting_stats as unknown as Record<string, { value: unknown } | null | undefined>;
  const stat = stats[key];
  if (!stat || stat.value == null) return null;
  const v = Number(stat.value);
  return Number.isNaN(v) || v === 0 ? null : v;
}

/** Generate plausible wrong numeric options around a correct value using percentage-based offsets */
function generateNumericOptions(
  correctValue: number,
  rng: () => number,
  count: number = 3,
  multipliers: number[] = [0.6, 0.75, 0.85, 1.15, 1.3, 1.5],
): string[] {
  const wrongValues = new Set<number>();
  const shuffledMultipliers = seededShuffle([...multipliers], rng);

  for (const mult of shuffledMultipliers) {
    if (wrongValues.size >= count) break;
    const candidate = Math.round(correctValue * mult);
    if (candidate !== correctValue && candidate > 0) {
      wrongValues.add(candidate);
    }
  }

  let offset = 1;
  while (wrongValues.size < count && offset < 100) {
    const candidate = correctValue + offset * (wrongValues.size % 2 === 0 ? 1 : -1);
    if (candidate > 0 && candidate !== correctValue) {
      wrongValues.add(candidate);
    }
    offset++;
  }

  return [...wrongValues].slice(0, count).map(String);
}

/** Generate plausible wrong cost options: correct cost +/- [500, 1000, 1500, 2000] randomly */
function generateCostOptions(correctCost: number, rng: () => number): string[] {
  const offsets = seededShuffle([500, 1000, 1500, 2000, 2500, 3000], rng);
  const wrongValues = new Set<number>();

  for (const offset of offsets) {
    if (wrongValues.size >= 3) break;
    const sign = rng() > 0.5 ? 1 : -1;
    const candidate = correctCost + sign * offset;
    if (candidate > 0 && candidate !== correctCost && !wrongValues.has(candidate)) {
      wrongValues.add(candidate);
    } else {
      const alt = correctCost - sign * offset;
      if (alt > 0 && alt !== correctCost && !wrongValues.has(alt)) {
        wrongValues.add(alt);
      }
    }
  }

  return [...wrongValues].slice(0, 3).map(String);
}

/** Build a shuffled options array and return it along with the correct index */
function buildOptions(
  correct: string,
  wrong: string[],
  rng: () => number,
): { options: string[]; correctIndex: number } {
  const all = [correct, ...wrong];
  const indexed = all.map((v, i) => ({ v, original: i }));
  seededShuffle(indexed, rng);
  const options = indexed.map((x) => x.v);
  const correctIndex = indexed.findIndex((x) => x.original === 0);
  return { options, correctIndex };
}

/** Pick N unique items from an array using seeded random */
function seededPickN<T>(arr: readonly T[], n: number, rng: () => number): T[] {
  const shuffled = seededShuffle([...arr], rng);
  return shuffled.slice(0, n);
}

// ============================================================
// --- Question Generators ---
// ============================================================

// ----- HERO QUESTIONS -----

const heroTypeQuestion: QuestionGenerator = (heroes, _items, _npcs, _abilities, rng) => {
  const heroesWithType = heroes.filter((h) => h.hero_type != null);
  if (heroesWithType.length === 0) return null;

  const hero = seededPick(heroesWithType, rng);
  if (!hero.hero_type) return null;
  const correctLabel = capitalize(hero.hero_type);
  const wrong = HERO_TYPES.filter((t) => t !== correctLabel);
  const { options, correctIndex } = buildOptions(correctLabel, [...wrong], rng);

  return { question: `What type is ${hero.name}?`, options, correctIndex, category: "Hero" };
};

/** "Which of these heroes is a {type}?" — 4 hero names, only one is the correct type */
const whichHeroIsTypeQuestion: QuestionGenerator = (heroes, _items, _npcs, _abilities, rng) => {
  const heroesWithType = heroes.filter((h) => h.hero_type != null);
  if (heroesWithType.length < 4) return null;

  const type = seededPick(HERO_TYPES, rng);
  const typeLower = type.toLowerCase();
  const matching = heroesWithType.filter((h) => h.hero_type === typeLower);
  const nonMatching = heroesWithType.filter((h) => h.hero_type !== typeLower);
  if (matching.length === 0 || nonMatching.length < 3) return null;

  const correct = seededPick(matching, rng);
  const wrong = seededPickN(nonMatching, 3, rng).map((h) => h.name);
  const { options, correctIndex } = buildOptions(correct.name, wrong, rng);

  return { question: `Which of these heroes is a ${type}?`, options, correctIndex, category: "Hero" };
};

/** "Which hero is NOT a {type}?" — 3 of same type + 1 odd one out */
const oddOneOutHeroTypeQuestion: QuestionGenerator = (heroes, _items, _npcs, _abilities, rng) => {
  const heroesWithType = heroes.filter((h) => h.hero_type != null);
  if (heroesWithType.length < 4) return null;

  const type = seededPick(HERO_TYPES, rng);
  const typeLower = type.toLowerCase();
  const matching = heroesWithType.filter((h) => h.hero_type === typeLower);
  const nonMatching = heroesWithType.filter((h) => h.hero_type !== typeLower);
  if (matching.length < 3 || nonMatching.length === 0) return null;

  const oddOne = seededPick(nonMatching, rng);
  const decoys = seededPickN(matching, 3, rng).map((h) => h.name);
  const { options, correctIndex } = buildOptions(oddOne.name, decoys, rng);

  return { question: `Which hero is NOT a ${type}?`, options, correctIndex, category: "Hero" };
};

/** "Which hero has the highest base {stat}?" — 4 heroes compared */
const highestStatQuestion: QuestionGenerator = (heroes, _items, _npcs, _abilities, rng) => {
  if (heroes.length < 4) return null;

  const statDef = seededPick(HERO_STAT_KEYS, rng);
  const heroesWithStat = heroes.filter((h) => getHeroStat(h, statDef.key) != null);
  if (heroesWithStat.length < 4) return null;

  const candidates = seededPickN(heroesWithStat, 4, rng);
  let best = candidates[0];
  let bestVal = getHeroStat(best, statDef.key)!;
  for (let i = 1; i < candidates.length; i++) {
    const val = getHeroStat(candidates[i], statDef.key)!;
    if (val > bestVal) {
      best = candidates[i];
      bestVal = val;
    }
  }

  const wrong = candidates.filter((h) => h.id !== best.id).map((h) => h.name);
  const { options, correctIndex } = buildOptions(best.name, wrong, rng);

  return {
    question: `Which hero has the highest base ${statDef.label}?`,
    options,
    correctIndex,
    category: "Hero",
  };
};

/** "What is {hero}'s base {stat}?" — numeric answer */
const heroStatQuestion: QuestionGenerator = (heroes, _items, _npcs, _abilities, rng) => {
  if (heroes.length === 0) return null;

  const hero = seededPick(heroes, rng);
  const statDef = seededPick(HERO_STAT_KEYS, rng);
  const value = getHeroStat(hero, statDef.key);
  if (value == null) return null;

  const stats = hero.starting_stats as unknown as Record<string, { display_stat_name: string } | null | undefined>;
  const displayLabel = stats[statDef.key]?.display_stat_name || statDef.label;
  const wrong = generateNumericOptions(value, rng, 3);
  const { options, correctIndex } = buildOptions(String(value), wrong, rng);

  return { question: `What is ${hero.name}'s base ${displayLabel}?`, options, correctIndex, category: "Hero" };
};

/** "What is {hero}'s complexity rating?" — 1, 2, or 3 */
const heroComplexityQuestion: QuestionGenerator = (heroes, _items, _npcs, _abilities, rng) => {
  const heroesWithComplexity = heroes.filter((h) => h.complexity >= 1 && h.complexity <= 3);
  if (heroesWithComplexity.length === 0) return null;

  const hero = seededPick(heroesWithComplexity, rng);
  const correct = String(hero.complexity);
  const wrong = ["1", "2", "3"].filter((c) => c !== correct);
  const { options, correctIndex } = buildOptions(correct, wrong, rng);

  return { question: `What is ${hero.name}'s complexity rating?`, options, correctIndex, category: "Hero" };
};

/** "How many {type} heroes are currently in the game?" */
const heroCountByTypeQuestion: QuestionGenerator = (heroes, _items, _npcs, _abilities, rng) => {
  const type = seededPick(HERO_TYPES, rng);
  const count = heroes.filter((h) => h.hero_type === type.toLowerCase()).length;
  if (count === 0) return null;

  const wrong = generateNumericOptions(count, rng, 3, [0.6, 0.75, 1.3, 1.5]);
  const { options, correctIndex } = buildOptions(String(count), wrong, rng);

  return { question: `How many ${type} heroes are in the game?`, options, correctIndex, category: "Hero" };
};

// ----- ABILITY QUESTIONS -----

/** "Which hero has the ability '{name}'?" */
const abilityBelongsToHeroQuestion: QuestionGenerator = (heroes, _items, _npcs, abilities, rng) => {
  if (abilities.length === 0 || heroes.length < 4) return null;

  const pick = seededPick(abilities, rng);
  const wrongHeroes = heroes.filter((h) => h.name !== pick.heroName);
  if (wrongHeroes.length < 3) return null;

  const wrong = seededPickN(wrongHeroes, 3, rng).map((h) => h.name);
  const { options, correctIndex } = buildOptions(pick.heroName, wrong, rng);

  return {
    question: `Which hero has the ability "${pick.ability.name}"?`,
    options,
    correctIndex,
    category: "Ability",
  };
};

/** "What is {hero}'s ultimate ability?" — pick from 4 ability names */
const heroUltimateQuestion: QuestionGenerator = (_heroes, _items, _npcs, abilities, rng) => {
  const ultimates = abilities.filter((a) => a.ability.ability_type === "ultimate");
  const nonUltimates = abilities.filter((a) => a.ability.ability_type !== "ultimate");
  if (ultimates.length === 0 || nonUltimates.length < 3) return null;

  const pick = seededPick(ultimates, rng);
  const wrong = seededPickN(nonUltimates, 3, rng).map((a) => a.ability.name);
  const { options, correctIndex } = buildOptions(pick.ability.name, wrong, rng);

  return {
    question: `What is ${pick.heroName}'s ultimate ability?`,
    options,
    correctIndex,
    category: "Ability",
  };
};

/** "What type of ability is '{name}'?" — Signature / Ultimate / Innate */
const abilityTypeQuestion: QuestionGenerator = (_heroes, _items, _npcs, abilities, rng) => {
  if (abilities.length === 0) return null;

  const pick = seededPick(abilities, rng);
  const type = pick.ability.ability_type;
  if (!type || !VALID_ABILITY_TYPES.has(type)) return null;

  const correctLabel = capitalize(type);
  const wrong = ABILITY_TYPES.filter((t) => t !== correctLabel);
  const { options, correctIndex } = buildOptions(correctLabel, [...wrong], rng);

  return {
    question: `What type of ability is "${pick.ability.name}"?`,
    options,
    correctIndex,
    category: "Ability",
  };
};

/** "Which of these is NOT one of {hero}'s abilities?" — 3 real + 1 from another hero */
const notHeroAbilityQuestion: QuestionGenerator = (heroes, _items, _npcs, abilities, rng) => {
  if (abilities.length === 0 || heroes.length < 2) return null;

  const heroNames = [...new Set(abilities.map((a) => a.heroName))];
  if (heroNames.length < 2) return null;

  const heroName = seededPick(heroNames, rng);
  const heroAbilities = abilities.filter((a) => a.heroName === heroName);
  const otherAbilities = abilities.filter((a) => a.heroName !== heroName);
  if (heroAbilities.length < 3 || otherAbilities.length === 0) return null;

  const decoys = seededPickN(heroAbilities, 3, rng).map((a) => a.ability.name);
  const oddOne = seededPick(otherAbilities, rng);
  const { options, correctIndex } = buildOptions(oddOne.ability.name, decoys, rng);

  return {
    question: `Which of these is NOT one of ${heroName}'s abilities?`,
    options,
    correctIndex,
    category: "Ability",
  };
};

// ----- ITEM QUESTIONS -----

const itemTierQuestion: QuestionGenerator = (_heroes, items, _npcs, _abilities, rng) => {
  const tieredItems = items.filter((i) => i.item_tier >= 1 && i.item_tier <= 4);
  if (tieredItems.length === 0) return null;

  const item = seededPick(tieredItems, rng);
  const correctTier = `Tier ${item.item_tier}`;
  const wrong = ITEM_TIERS.filter((t) => t !== correctTier);
  const { options, correctIndex } = buildOptions(correctTier, [...wrong], rng);

  return { question: `What tier is ${item.name}?`, options, correctIndex, category: "Item" };
};

const itemCostQuestion: QuestionGenerator = (_heroes, items, _npcs, _abilities, rng) => {
  const itemsWithCost = items.filter((i) => i.cost != null && i.cost > 0);
  if (itemsWithCost.length === 0) return null;

  const item = seededPick(itemsWithCost, rng);
  if (item.cost == null) return null;
  const wrong = generateCostOptions(item.cost, rng);
  const { options, correctIndex } = buildOptions(String(item.cost), wrong, rng);

  return {
    question: `How much does ${item.name} cost?`,
    options: options.map((v) => `${v} Souls`),
    correctIndex,
    category: "Item",
  };
};

const itemSlotQuestion: QuestionGenerator = (_heroes, items, _npcs, _abilities, rng) => {
  if (items.length === 0) return null;

  const item = seededPick(items, rng);
  const correctSlot = capitalize(item.item_slot_type);
  const wrong = ITEM_SLOTS.filter((s) => s !== correctSlot);
  const { options, correctIndex } = buildOptions(correctSlot, [...wrong], rng);

  return { question: `What category is ${item.name}?`, options, correctIndex, category: "Item" };
};

/** "Is {item} an active or passive item?" */
const isItemActiveQuestion: QuestionGenerator = (_heroes, items, _npcs, _abilities, rng) => {
  if (items.length === 0) return null;

  const item = seededPick(items, rng);
  const correct = item.is_active_item ? "Active" : "Passive";
  const wrong = item.is_active_item ? ["Passive"] : ["Active"];
  // Add 2 more plausible wrong options for 4-option format
  wrong.push("Component", "Consumable");
  const { options, correctIndex } = buildOptions(correct, wrong.slice(0, 3), rng);

  return { question: `Is ${item.name} an active or passive item?`, options, correctIndex, category: "Item" };
};

/** "Which of these items costs the most?" — compare 4 items */
const whichCostsMoreQuestion: QuestionGenerator = (_heroes, items, _npcs, _abilities, rng) => {
  const itemsWithCost = items.filter((i) => i.cost != null && i.cost > 0);
  if (itemsWithCost.length < 4) return null;

  const candidates = seededPickN(itemsWithCost, 4, rng);
  let most = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if ((candidates[i].cost ?? 0) > (most.cost ?? 0)) {
      most = candidates[i];
    }
  }

  // Ensure there's a clear winner (no ties)
  const tiedCount = candidates.filter((c) => c.cost === most.cost).length;
  if (tiedCount > 1) return null;

  const wrong = candidates.filter((c) => c.id !== most.id).map((c) => c.name);
  const { options, correctIndex } = buildOptions(most.name, wrong, rng);

  return { question: "Which of these items costs the most?", options, correctIndex, category: "Item" };
};

/** "Which item is NOT a {slot} item?" — 3 same slot + 1 different */
const oddOneOutItemSlotQuestion: QuestionGenerator = (_heroes, items, _npcs, _abilities, rng) => {
  if (items.length < 4) return null;

  const slot = seededPick(ITEM_SLOTS, rng);
  const slotLower = slot.toLowerCase();
  const matching = items.filter((i) => i.item_slot_type === slotLower);
  const nonMatching = items.filter((i) => i.item_slot_type !== slotLower);
  if (matching.length < 3 || nonMatching.length === 0) return null;

  const oddOne = seededPick(nonMatching, rng);
  const decoys = seededPickN(matching, 3, rng).map((i) => i.name);
  const { options, correctIndex } = buildOptions(oddOne.name, decoys, rng);

  return { question: `Which item is NOT a ${slot} item?`, options, correctIndex, category: "Item" };
};

/** "How many Tier {n} items are in the shop?" */
const itemCountQuestion: QuestionGenerator = (_heroes, items, _npcs, _abilities, rng) => {
  const tier = Math.floor(rng() * 4) + 1;
  const count = items.filter((i) => i.item_tier === tier).length;
  if (count === 0) return null;

  const wrong = generateNumericOptions(count, rng, 3, [0.7, 0.85, 1.2, 1.4]);
  const { options, correctIndex } = buildOptions(String(count), wrong, rng);

  return { question: `How many Tier ${tier} items are in the shop?`, options, correctIndex, category: "Item" };
};

/** "How many {slot} items are in the game?" */
const itemCountBySlotQuestion: QuestionGenerator = (_heroes, items, _npcs, _abilities, rng) => {
  const slot = seededPick(ITEM_SLOTS, rng);
  const count = items.filter((i) => i.item_slot_type === slot.toLowerCase()).length;
  if (count === 0) return null;

  const wrong = generateNumericOptions(count, rng, 3, [0.7, 0.85, 1.2, 1.4]);
  const { options, correctIndex } = buildOptions(String(count), wrong, rng);

  return { question: `How many ${slot} items are in the game?`, options, correctIndex, category: "Item" };
};

/** "Which of these items is Tier {n}?" — 4 items, only one is the correct tier */
const whichItemIsTierQuestion: QuestionGenerator = (_heroes, items, _npcs, _abilities, rng) => {
  if (items.length < 4) return null;

  const tier = Math.floor(rng() * 4) + 1;
  const matching = items.filter((i) => i.item_tier === tier);
  const nonMatching = items.filter((i) => i.item_tier !== tier && i.item_tier >= 1 && i.item_tier <= 4);
  if (matching.length === 0 || nonMatching.length < 3) return null;

  const correct = seededPick(matching, rng);
  const wrong = seededPickN(nonMatching, 3, rng).map((i) => i.name);
  const { options, correctIndex } = buildOptions(correct.name, wrong, rng);

  return { question: `Which of these items is Tier ${tier}?`, options, correctIndex, category: "Item" };
};

// ----- NPC QUESTIONS -----

const npcHealthQuestion: QuestionGenerator = (_heroes, _items, npcs, _abilities, rng) => {
  const healthyNpcs = npcs.filter((n) => n.max_health != null && n.max_health > 0);
  if (healthyNpcs.length === 0) return null;

  const npc = seededPick(healthyNpcs, rng);
  if (npc.max_health == null) return null;
  const displayName = formatNpcName(npc.class_name);
  const wrong = generateNumericOptions(npc.max_health, rng, 3, [0.6, 0.8, 1.3, 1.5]);
  const { options, correctIndex } = buildOptions(String(npc.max_health), wrong, rng);

  return { question: `What is the max health of ${displayName}?`, options, correctIndex, category: "NPC" };
};

/** "How much gold does {npc} reward?" */
const npcGoldRewardQuestion: QuestionGenerator = (_heroes, _items, npcs, _abilities, rng) => {
  const rewardNpcs = npcs.filter((n) => n.gold_reward != null && n.gold_reward > 0);
  if (rewardNpcs.length === 0) return null;

  const npc = seededPick(rewardNpcs, rng);
  if (npc.gold_reward == null) return null;
  const displayName = formatNpcName(npc.class_name);
  const wrong = generateNumericOptions(npc.gold_reward, rng, 3, [0.5, 0.75, 1.3, 1.6]);
  const { options, correctIndex } = buildOptions(String(npc.gold_reward), wrong, rng);

  return { question: `How much gold does ${displayName} reward?`, options, correctIndex, category: "NPC" };
};

// ============================================================

const ALL_GENERATORS: QuestionGenerator[] = [
  // Hero (7)
  heroTypeQuestion,
  whichHeroIsTypeQuestion,
  oddOneOutHeroTypeQuestion,
  highestStatQuestion,
  heroStatQuestion,
  heroComplexityQuestion,
  heroCountByTypeQuestion,
  // Ability (4)
  abilityBelongsToHeroQuestion,
  heroUltimateQuestion,
  abilityTypeQuestion,
  notHeroAbilityQuestion,
  // Item (8)
  itemTierQuestion,
  itemCostQuestion,
  itemSlotQuestion,
  isItemActiveQuestion,
  whichCostsMoreQuestion,
  oddOneOutItemSlotQuestion,
  itemCountQuestion,
  itemCountBySlotQuestion,
  whichItemIsTierQuestion,
  // NPC (2)
  npcHealthQuestion,
  npcGoldRewardQuestion,
];

const MAX_TYPE_REPEATS = 2;
const QUESTION_COUNT = 10;

/** Build ability-hero pairs from raw abilities and playable heroes */
export function buildAbilitiesWithHeroes(rawAbilities: AbilityV2[], playableHeroes: HeroV2[]): AbilityWithHero[] {
  const heroMap = new Map<number, HeroV2>();
  for (const hero of playableHeroes) {
    heroMap.set(hero.id, hero);
  }

  const result: AbilityWithHero[] = [];
  for (const ability of rawAbilities) {
    if (!ability.ability_type || !VALID_ABILITY_TYPES.has(ability.ability_type)) continue;
    if (!ability.name || !ability.hero) continue;
    const hero = heroMap.get(ability.hero);
    if (!hero) continue;
    result.push({ ability, heroName: hero.name });
  }
  return result;
}

export function generateDailyQuestions(
  rawHeroes: HeroV2[],
  rawItems: UpgradeV2[],
  npcUnits: NpcUnit[],
  abilitiesWithHeroes: AbilityWithHero[],
  rng: () => number,
): TriviaQuestion[] {
  const heroes = filterPlayableHeroes(rawHeroes);
  const items = filterShopableItems(rawItems);

  const questions: TriviaQuestion[] = [];
  const generatorUsage = new Map<number, number>();

  const generatorPool: number[] = [];
  for (let round = 0; round < Math.ceil(QUESTION_COUNT / ALL_GENERATORS.length) + 2; round++) {
    for (let i = 0; i < ALL_GENERATORS.length; i++) {
      generatorPool.push(i);
    }
  }
  seededShuffle(generatorPool, rng);

  let poolIndex = 0;
  let maxAttempts = 300;

  while (questions.length < QUESTION_COUNT && maxAttempts-- > 0) {
    const genIndex = generatorPool[poolIndex % generatorPool.length];
    poolIndex++;

    const currentUsage = generatorUsage.get(genIndex) ?? 0;
    if (currentUsage >= MAX_TYPE_REPEATS) continue;

    const question = ALL_GENERATORS[genIndex](heroes, items, npcUnits, abilitiesWithHeroes, rng);
    if (!question) continue;

    if (questions.some((q) => q.question === question.question)) continue;

    questions.push(question);
    generatorUsage.set(genIndex, currentUsage + 1);
  }

  return questions;
}
