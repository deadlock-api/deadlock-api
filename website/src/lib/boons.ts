import type { Hero } from "deadlock_api_client";

import { seededRandom, seededShuffle } from "~/lib/daily-seed";

/** A boon (hero level): the souls it takes, and the ability points and unlocks gained up to and including it. */
export interface BoonLevel {
  boon: number;
  souls: number;
  abilityPoints: number;
  abilityUnlocks: number;
}

/** The boon table of a hero's `level_info`, in order, with the ability points and unlocks summed up. */
export function boonLevelsFrom(levelInfo: Hero["level_info"]): BoonLevel[] {
  let abilityPoints = 0;
  let abilityUnlocks = 0;
  return Object.entries(levelInfo)
    .map(([boon, info]) => ({ boon: Number(boon), info }))
    .filter(({ boon }) => Number.isInteger(boon))
    .sort((a, b) => a.boon - b.boon)
    .map(({ boon, info }) => {
      for (const currency of info.bonus_currencies ?? []) {
        if (currency === "EAbilityPoints") abilityPoints += 1;
        if (currency === "EAbilityUnlocks") abilityUnlocks += 1;
      }
      return { boon, souls: info.required_gold, abilityPoints, abilityUnlocks };
    });
}

/** An ability slot: `null` while locked, else its upgrade tier (0 is unlocked, not yet upgraded). */
export type SlotTier = null | 0 | 1 | 2 | 3;

/** The ability points an ability at each tier has taken: 1, 2 and 5 for the three upgrades. */
const POINTS_TO_TIER = [0, 1, 3, 8] as const;

/** The first boon at which the four slots can be at these tiers, or null if none reaches them. */
export function requiredBoon(slots: readonly SlotTier[], levels: readonly BoonLevel[]): BoonLevel | null {
  const unlocks = slots.filter((tier) => tier !== null).length;
  const points = slots.reduce((sum: number, tier) => sum + (tier === null ? 0 : POINTS_TO_TIER[tier]), 0);
  return levels.find((level) => level.abilityUnlocks >= unlocks && level.abilityPoints >= points) ?? null;
}

export interface BoonCard {
  id: number;
  /** The four slots, in the order the card shows them. */
  slots: SlotTier[];
  /** The first boon that reaches them. */
  level: BoonLevel;
}

const TIERS: readonly SlotTier[] = [3, 2, 1, 0, null];

/**
 * Every set of four slot tiers with at least one ability unlocked, once each (a set in any order is the same card).
 * The slots are shown in an order drawn from the card's id, so it is the same every time.
 */
export function boonCards(levels: readonly BoonLevel[]): BoonCard[] {
  const cards: BoonCard[] = [];
  const pick = (from: number, chosen: number[]) => {
    if (chosen.length === 4) {
      const slots = chosen.map((index) => TIERS[index] ?? null);
      if (slots.every((tier) => tier === null)) return;
      const level = requiredBoon(slots, levels);
      if (!level) return;
      const id = chosen.reduce((sum, index) => sum * TIERS.length + index, 0) + 1;
      cards.push({ id, slots: seededShuffle(slots, seededRandom(id)), level });
      return;
    }
    for (let index = from; index < TIERS.length; index++) pick(index, [...chosen, index]);
  };
  pick(0, []);
  return cards;
}

/** The answer's boon and the three boons nearest it, by souls. */
export function boonOptions(answer: BoonLevel, levels: readonly BoonLevel[], random: () => number): BoonLevel[] {
  const distractors = levels
    .filter((level) => level.boon !== answer.boon)
    .map((level) => ({ level, distance: Math.abs(level.boon - answer.boon) + random() * 0.5 }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map(({ level }) => level);
  return [answer, ...distractors].sort((a, b) => a.souls - b.souls);
}
