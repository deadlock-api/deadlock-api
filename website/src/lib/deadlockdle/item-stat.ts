import type { Upgrade } from "deadlock_api_client";

import { seededShuffle } from "./seed";

/** One stat of an item to name among four values: "Bullet Velocity", 60%, against 30%, 45% and 90%. */
export interface ItemStatQuestion {
  label: string;
  answer: string;
  /** The answer and three wrong values, smallest first. */
  options: string[];
}

/** How far a wrong value sits from the real one, as a factor; three of these are drawn per item. */
const FACTORS = [0.4, 0.5, 0.6, 0.67, 0.75, 0.8, 1.25, 1.33, 1.5, 1.75, 2, 2.5];

/** The keys an item's tooltip shows, the headline ones first: important, then elevated, then the rest. */
function tooltipKeys(item: Upgrade): string[] {
  const attributes = (item.tooltip_sections ?? []).flatMap((section) => section.section_attributes ?? []);
  return [
    ...attributes.flatMap((attribute) => attribute.important_properties ?? []),
    ...attributes.flatMap((attribute) => attribute.elevated_properties ?? []),
    ...attributes.flatMap((attribute) => attribute.properties ?? []),
  ];
}

/** The decimals a value is written with: 2.5 has one, 60 none. */
function decimalsOf(value: number): number {
  return String(value).split(".")[1]?.length ?? 0;
}

/**
 * A wrong value near `value`, written like it: a round 60 gets round neighbours (30, 45, 90), so the real value is not
 * the only round one.
 */
function nearValue(value: number, factor: number): number {
  const decimals = decimalsOf(value);
  const step = decimals > 0 ? 10 ** -decimals : value % 5 === 0 && value >= 10 ? 5 : 1;
  return Number((Math.round((value * factor) / step) * step).toFixed(decimals));
}

/**
 * The headline stat of an item's tooltip with three wrong values beside it, or undefined when the tooltip shows no
 * positive number. `rng` picks the wrong values, so the day's seed fixes them.
 */
export function itemStatQuestion(item: Upgrade, rng: () => number): ItemStatQuestion | undefined {
  const properties = item.properties ?? {};
  for (const key of tooltipKeys(item)) {
    const property = properties[key];
    // Values carry their unit at times ("13m"), which `parseFloat` drops.
    const value = Number.parseFloat(String(property?.value));
    if (!property?.label || !(value > 0)) continue;
    const unit = (property.postfix ?? "").trim();
    const wrong = [...new Set(seededShuffle([...FACTORS], rng).map((factor) => nearValue(value, factor)))]
      // 4.5 among 3, 6 and 9 would be the one with a decimal.
      .filter((candidate) => candidate > 0 && candidate !== value && decimalsOf(candidate) === decimalsOf(value))
      .slice(0, 3);
    if (wrong.length < 3) continue;
    const options = [value, ...wrong].toSorted((a, b) => a - b).map((option) => `${option}${unit}`);
    return { label: property.label, answer: `${value}${unit}`, options };
  }
  return undefined;
}
