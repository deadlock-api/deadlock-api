import type { Draft, Side } from "./analysis";

/**
 * Where the picker goes after `slot` of `side` is filled, so a whole team can be drafted without reopening it: the
 * next empty slot of the same side, then an earlier one, then the other side's first. Null once every slot is filled.
 */
export function nextEmptySlot(draft: Draft, side: Side, slot: number): { side: Side; slot: number } | null {
  const filled = (s: Side, i: number) => (s === side && i === slot) || draft[s][i] != null;
  const own = draft[side];
  for (let offset = 1; offset < own.length; offset++) {
    const i = (slot + offset) % own.length;
    if (!filled(side, i)) return { side, slot: i };
  }
  const other: Side = side === "ally" ? "enemy" : "ally";
  const index = draft[other].findIndex((_, i) => !filled(other, i));
  return index === -1 ? null : { side: other, slot: index };
}
