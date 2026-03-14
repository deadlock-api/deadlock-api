import type { HeroV2, UpgradeV2 } from "assets_deadlock_api_client/api";

import { filterPlayableHeroes, filterShopableItems } from "./queries";
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
  id: number;
};

const HERO_TYPES = ["Assassin", "Brawler", "Marksman", "Mystic"] as const;
const ITEM_TIERS = ["Tier 1", "Tier 2", "Tier 3", "Tier 4"] as const;
const ITEM_SLOTS = ["Weapon", "Spirit", "Vitality"] as const;

/** Interesting stats for hero stat questions with display-friendly labels */
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

  // Fallback: if we still need more, offset by fixed amounts
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
    // Randomly add or subtract
    const sign = rng() > 0.5 ? 1 : -1;
    const candidate = correctCost + sign * offset;
    if (candidate > 0 && candidate !== correctCost && !wrongValues.has(candidate)) {
      wrongValues.add(candidate);
    } else {
      // Try the opposite sign
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

// --- Question Generators ---

const heroTypeQuestion: QuestionGenerator = (heroes, _items, _npcs, rng) => {
  const heroesWithType = heroes.filter((h) => h.hero_type != null);
  if (heroesWithType.length === 0) return null;

  const hero = seededPick(heroesWithType, rng);
  const correctType = hero.hero_type;
  if (!correctType) return null;
  const correctLabel = correctType.charAt(0).toUpperCase() + correctType.slice(1);

  const wrong = HERO_TYPES.filter((t) => t !== correctLabel);
  const { options, correctIndex } = buildOptions(correctLabel, [...wrong], rng);

  return {
    question: `What type is ${hero.name}?`,
    options,
    correctIndex,
    category: "Hero",
  };
};

const itemTierQuestion: QuestionGenerator = (_heroes, items, _npcs, rng) => {
  const tieredItems = items.filter((i) => i.item_tier >= 1 && i.item_tier <= 4);
  if (tieredItems.length === 0) return null;

  const item = seededPick(tieredItems, rng);
  const correctTier = `Tier ${item.item_tier}`;
  const wrong = ITEM_TIERS.filter((t) => t !== correctTier);
  const { options, correctIndex } = buildOptions(correctTier, [...wrong], rng);

  return {
    question: `What tier is ${item.name}?`,
    options,
    correctIndex,
    category: "Item",
  };
};

const itemCostQuestion: QuestionGenerator = (_heroes, items, _npcs, rng) => {
  const itemsWithCost = items.filter((i) => i.cost != null && i.cost > 0);
  if (itemsWithCost.length === 0) return null;

  const item = seededPick(itemsWithCost, rng);
  if (item.cost == null) return null;
  const correctCost = item.cost;
  const wrong = generateCostOptions(correctCost, rng);
  const { options, correctIndex } = buildOptions(String(correctCost), wrong, rng);

  return {
    question: `How much does ${item.name} cost?`,
    options: options.map((v) => `${v} Souls`),
    correctIndex,
    category: "Item",
  };
};

const itemSlotQuestion: QuestionGenerator = (_heroes, items, _npcs, rng) => {
  if (items.length === 0) return null;

  const item = seededPick(items, rng);
  const correctSlot = item.item_slot_type.charAt(0).toUpperCase() + item.item_slot_type.slice(1);
  const wrong = ITEM_SLOTS.filter((s) => s !== correctSlot);
  const { options, correctIndex } = buildOptions(correctSlot, [...wrong], rng);

  return {
    question: `What category is ${item.name}?`,
    options,
    correctIndex,
    category: "Item",
  };
};

const npcHealthQuestion: QuestionGenerator = (_heroes, _items, npcs, rng) => {
  const healthyNpcs = npcs.filter((n) => n.max_health != null && n.max_health > 0);
  if (healthyNpcs.length === 0) return null;

  const npc = seededPick(healthyNpcs, rng);
  if (npc.max_health == null) return null;
  const correctHealth = npc.max_health;
  const displayName = formatNpcName(npc.class_name);
  const wrong = generateNumericOptions(correctHealth, rng, 3, [0.6, 0.8, 1.3, 1.5]);
  const { options, correctIndex } = buildOptions(String(correctHealth), wrong, rng);

  return {
    question: `What is the max health of ${displayName}?`,
    options,
    correctIndex,
    category: "NPC",
  };
};

const heroStatQuestion: QuestionGenerator = (heroes, _items, _npcs, rng) => {
  if (heroes.length === 0) return null;

  const hero = seededPick(heroes, rng);
  const statDef = seededPick(HERO_STAT_KEYS, rng);
  const stats = hero.starting_stats as Record<string, { value: unknown; display_stat_name: string } | null | undefined>;
  const stat = stats[statDef.key];
  if (!stat || stat.value == null) return null;

  const value = Number(stat.value);
  if (Number.isNaN(value) || value === 0) return null;

  const displayLabel = stat.display_stat_name || statDef.label;
  const wrong = generateNumericOptions(value, rng, 3);
  const { options, correctIndex } = buildOptions(String(value), wrong, rng);

  return {
    question: `What is ${hero.name}'s base ${displayLabel}?`,
    options,
    correctIndex,
    category: "Hero",
  };
};

const itemCountQuestion: QuestionGenerator = (_heroes, items, _npcs, rng) => {
  const tier = Math.floor(rng() * 4) + 1;
  const count = items.filter((i) => i.item_tier === tier).length;
  if (count === 0) return null;

  const wrong = generateNumericOptions(count, rng, 3, [0.7, 0.85, 1.2, 1.4]);
  const { options, correctIndex } = buildOptions(String(count), wrong, rng);

  return {
    question: `How many Tier ${tier} items are in the shop?`,
    options,
    correctIndex,
    category: "Item",
  };
};

const ALL_GENERATORS: QuestionGenerator[] = [
  heroTypeQuestion,
  itemTierQuestion,
  itemCostQuestion,
  itemSlotQuestion,
  npcHealthQuestion,
  heroStatQuestion,
  itemCountQuestion,
];

const MAX_TYPE_REPEATS = 3;
const QUESTION_COUNT = 10;

export function generateDailyQuestions(
  rawHeroes: HeroV2[],
  rawItems: UpgradeV2[],
  npcUnits: NpcUnit[],
  rng: () => number,
): TriviaQuestion[] {
  const heroes = filterPlayableHeroes(rawHeroes);
  const items = filterShopableItems(rawItems);

  const questions: TriviaQuestion[] = [];
  const generatorUsage = new Map<number, number>();

  // Pre-shuffle the generator order pool: repeat generators enough times to fill
  const generatorPool: number[] = [];
  for (let round = 0; round < Math.ceil(QUESTION_COUNT / ALL_GENERATORS.length) + 2; round++) {
    for (let i = 0; i < ALL_GENERATORS.length; i++) {
      generatorPool.push(i);
    }
  }
  seededShuffle(generatorPool, rng);

  let poolIndex = 0;
  let maxAttempts = 200;

  while (questions.length < QUESTION_COUNT && maxAttempts-- > 0) {
    const genIndex = generatorPool[poolIndex % generatorPool.length];
    poolIndex++;

    const currentUsage = generatorUsage.get(genIndex) ?? 0;
    if (currentUsage >= MAX_TYPE_REPEATS) continue;

    const question = ALL_GENERATORS[genIndex](heroes, items, npcUnits, rng);
    if (!question) continue;

    // Avoid duplicate question text
    if (questions.some((q) => q.question === question.question)) continue;

    questions.push(question);
    generatorUsage.set(genIndex, currentUsage + 1);
  }

  return questions;
}
