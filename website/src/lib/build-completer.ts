/** What an auto-completed build leans toward: one shop category, or none. */
export type BuildFocus = "balanced" | "weapon" | "spirit" | "vitality";
/** What it ranks items by: how many players buy them, or how they win (pulled toward the build's own rate). */
export type BuildGoal = "popular" | "winning";

export interface CompleterChoice {
  key: string;
  column: number;
  itemId: number;
  /** Share of the build's players who buy it in this stage, 0 to 1. */
  pickRate: number;
  /** Win rate pulled toward the build's own; the `winning` goal ranks by it. */
  score: number;
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
  focus: BuildFocus;
  goal: BuildGoal;
}

// An item bought by fewer of the build's players than this is never added: a rare pick is noise, not a plan.
const MIN_PICK_RATE = 0.05;
// How much the focus category is favoured: an item of another category ranks at this share of its value.
const OFF_FOCUS_WEIGHT = 0.25;

/**
 * Completes a build stage by stage with the items its players buy there, best first by `goal` and with `focus`'s
 * category favoured, as long as the stage's souls (earned by its end, less what the build has spent) and its slots
 * allow. The reader's picks stay; no item is added twice. Returns the keys to add, in buying order.
 */
export function completeBuild(input: CompleterInput): string[] {
  const { stages, choices, path, priceOf, categoryOf, componentsOf, focus, goal } = input;
  const owned = new Set(path.map((key) => Number(key.split(":")[1])));
  const added: { column: number; itemId: number; key: string }[] = [];
  const picks = path.map((key) => ({ column: Number(key.split(":")[0]), itemId: Number(key.split(":")[1]) }));

  for (const stage of stages) {
    // What the build holds and has spent up to this stage: the reader's picks so far and what was added so far.
    const sofar = [...picks.filter((p) => p.column <= stage.column), ...added];
    const held = new Set(sofar.map((p) => p.itemId));
    // An upgrade onto a held component costs the difference: the component's price is not paid twice.
    const merged = new Set(sofar.flatMap((p) => componentsOf(p.itemId)).filter((id) => held.has(id)));
    let spent = sofar.reduce((sum, p) => sum + priceOf(p.itemId), 0);
    for (const p of sofar) {
      for (const id of componentsOf(p.itemId)) if (held.has(id)) spent -= priceOf(id);
    }
    for (const id of merged) held.delete(id);

    const candidates = choices.filter(
      (c) => c.column === stage.column && !owned.has(c.itemId) && c.pickRate >= MIN_PICK_RATE,
    );
    const best = Math.max(...candidates.map((c) => (goal === "popular" ? c.pickRate : c.score)), 1e-9);
    const rank = (c: CompleterChoice) =>
      ((goal === "popular" ? c.pickRate : c.score) / best) *
      (focus === "balanced" || categoryOf(c.itemId) === focus ? 1 : OFF_FOCUS_WEIGHT);
    for (const choice of [...candidates].sort((a, b) => rank(b) - rank(a))) {
      // An upgrade takes its components' slots and their price, so it needs no new slot if built from one held.
      const frees = componentsOf(choice.itemId).filter((id) => held.has(id));
      const price = priceOf(choice.itemId) - frees.reduce((sum, id) => sum + priceOf(id), 0);
      if (spent + price > stage.available) continue;
      if (held.size - frees.length + 1 > stage.slots) continue;
      for (const id of frees) held.delete(id);
      held.add(choice.itemId);
      owned.add(choice.itemId);
      spent += price;
      added.push({ column: stage.column, itemId: choice.itemId, key: choice.key });
    }
  }
  return added.map((a) => a.key);
}
