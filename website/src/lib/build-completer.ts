/** What an auto-completed build leans toward: one shop category, or none. */
export type BuildFocus = "balanced" | "weapon" | "spirit" | "vitality";
/**
 * What it ranks items by: how many players buy them (`popular`), how they win pulled toward the build's own rate
 * (`winning`), or the least their win rate may be by its 95% interval (`confident`, `lowerBound`), so a rate from a
 * handful of games does not outrank one from many.
 */
export type BuildGoal = "popular" | "winning" | "confident";

export interface CompleterChoice {
  key: string;
  column: number;
  itemId: number;
  /** Share of the build's players who buy it in this stage, 0 to 1. */
  pickRate: number;
  /** Win rate pulled toward the build's own; the `winning` goal ranks by it. */
  score: number;
  /** The low end of its win rate's 95% interval; the `confident` goal ranks by it (`score` without it). */
  lowerBound?: number;
}

export interface CompleterStage {
  column: number;
  /** Souls the hero's players have earned by the stage's end. */
  available: number;
  /** Item slots open at the stage's end. */
  slots: number;
}

export interface CompleterInput {
  stages: readonly CompleterStage[];
  choices: readonly CompleterChoice[];
  /** The build so far, `${column}:${itemId}`. */
  path: readonly string[];
  priceOf: (itemId: number) => number;
  categoryOf: (itemId: number) => string | undefined;
  /** Items each item is built from: buying it frees their slots. */
  componentsOf: (itemId: number) => readonly number[];
  /** The build's planned sales: a pick's key and the stage it is sold in. A sold item frees its slot and refunds. */
  sells?: ReadonlyMap<string, number>;
  /**
   * Share of the hero's buyers of an item who sell it, 0 to 1 (a component's count its upgrades as well). Without it
   * nothing is sold.
   */
  sellShareOf?: (itemId: number) => number | null | undefined;
  focus: BuildFocus;
  goal: BuildGoal;
}

/** An item to add, and the held item sold in its stage to make room for it. */
export interface CompleterStep {
  key: string;
  sells?: string;
}

// Selling refunds half an item's price.
export const SELL_REFUND = 0.5;

// An item bought by fewer of the build's players than this is never added: a rare pick is noise, not a plan.
const MIN_PICK_RATE = 0.05;
// An item is only sold to make room when most of its buyers sell it (or upgrade it, for a component).
const MIN_SELL_SHARE = 0.5;
// How much the focus category is favoured: an item of another category ranks at this share of its value.
const OFF_FOCUS_WEIGHT = 0.25;

/**
 * Completes a build stage by stage with the items its players buy there, best first by `goal` and with `focus`'s
 * category favoured, as long as the stage's souls (earned by its end, less what the build has spent, plus the refunds of
 * its sales) and its slots allow. With the slots full, it sells a cheaper held item from an earlier stage that most of
 * its buyers sell, to make room. The reader's picks and sales stay; no item is added twice. Returns the items to add,
 * in buying order.
 */
export function completeBuild(input: CompleterInput): CompleterStep[] {
  const { stages, choices, path, priceOf, categoryOf, componentsOf, sellShareOf, focus, goal } = input;
  const sales = new Map(input.sells ?? []);
  const owned = new Set(path.map((key) => Number(key.split(":")[1])));
  const added: (Pick & CompleterStep)[] = [];
  const picks: Pick[] = path.map((key) => ({
    key,
    column: Number(key.split(":")[0]),
    itemId: Number(key.split(":")[1]),
  }));
  const shareOf = (itemId: number) => sellShareOf?.(itemId) ?? 0;

  for (const stage of stages) {
    // What the build holds and has spent up to this stage: the reader's picks so far and what was added so far.
    const sofar = [...picks.filter((p) => p.column <= stage.column), ...added];
    const held = new Map(sofar.map((p) => [p.itemId, p]));
    // An upgrade onto a held component costs the difference: the component's price is not paid twice.
    const merged = new Set(sofar.flatMap((p) => componentsOf(p.itemId)).filter((id) => held.has(id)));
    let spent = sofar.reduce((sum, p) => sum + priceOf(p.itemId), 0);
    for (const p of sofar) {
      for (const id of componentsOf(p.itemId)) if (held.has(id)) spent -= priceOf(id);
    }
    for (const id of merged) held.delete(id);
    // A sale by this stage frees the slot and refunds part of the price.
    for (const p of [...held.values()]) {
      const soldIn = sales.get(p.key);
      if (soldIn == null || soldIn > stage.column) continue;
      held.delete(p.itemId);
      spent -= priceOf(p.itemId) * SELL_REFUND;
    }
    // Components of the build's later picks stay: selling one would undo the upgrade it goes into.
    const builtLater = new Set(picks.filter((p) => p.column > stage.column).flatMap((p) => componentsOf(p.itemId)));

    const candidates = choices.filter(
      (c) => c.column === stage.column && !owned.has(c.itemId) && c.pickRate >= MIN_PICK_RATE,
    );
    const value = (c: CompleterChoice) =>
      goal === "popular" ? c.pickRate : goal === "confident" ? (c.lowerBound ?? c.score) : c.score;
    const best = Math.max(...candidates.map(value), 1e-9);
    const rank = (c: CompleterChoice) =>
      (value(c) / best) * (focus === "balanced" || categoryOf(c.itemId) === focus ? 1 : OFF_FOCUS_WEIGHT);
    for (const choice of [...candidates].sort((a, b) => rank(b) - rank(a))) {
      // An upgrade takes its components' slots and their price, so it needs no new slot if built from one held.
      const frees = componentsOf(choice.itemId).filter((id) => held.has(id));
      const price = priceOf(choice.itemId) - frees.reduce((sum, id) => sum + priceOf(id), 0);
      // With the slots full, the held item its buyers sell most often makes room, if it is cheaper than its successor.
      let sale: Pick | undefined;
      if (held.size - frees.length + 1 > stage.slots) {
        [sale] = [...held.values()]
          .filter(
            (p) =>
              p.column < stage.column &&
              !frees.includes(p.itemId) &&
              !builtLater.has(p.itemId) &&
              priceOf(p.itemId) < priceOf(choice.itemId) &&
              shareOf(p.itemId) >= MIN_SELL_SHARE,
          )
          .sort((a, b) => shareOf(b.itemId) - shareOf(a.itemId) || priceOf(a.itemId) - priceOf(b.itemId));
        if (!sale) continue;
      }
      const refund = sale ? priceOf(sale.itemId) * SELL_REFUND : 0;
      if (spent + price - refund > stage.available) continue;
      for (const id of frees) held.delete(id);
      if (sale) {
        held.delete(sale.itemId);
        sales.set(sale.key, stage.column);
      }
      const pick = { column: stage.column, itemId: choice.itemId, key: choice.key };
      held.set(choice.itemId, pick);
      owned.add(choice.itemId);
      spent += price - refund;
      added.push({ ...pick, ...(sale ? { sells: sale.key } : {}) });
    }
  }
  return added.map(({ key, sells }) => (sells ? { key, sells } : { key }));
}

interface Pick {
  key: string;
  column: number;
  itemId: number;
}
