import { createParser, useQueryState } from "nuqs";
import { useCallback, useMemo } from "react";

import type { Draft, Side } from "~/lib/team-builder/analysis";
import { TEAM_SIZE } from "~/lib/team-builder/lanes";

const EMPTY_SIDE = Array(TEAM_SIZE).fill(null) as (number | null)[];

/** `31,0,2,0,0,0` — one entry per slot, `0` for an empty one, so slot order (and with it the lane) survives a share link. */
const parseAsTeam = createParser<(number | null)[]>({
  parse: (value: string) => {
    if (!value) return null;
    const slots = value.split(",", TEAM_SIZE).map((raw) => {
      const id = Number.parseInt(raw, 10);
      return Number.isFinite(id) && id > 0 ? id : null;
    });
    return [...slots, ...EMPTY_SIDE].slice(0, TEAM_SIZE);
  },
  serialize: (value: (number | null)[]) => value.map((id) => id ?? 0).join(","),
});

export interface DraftControls {
  draft: Draft;
  setSlot: (side: Side, slot: number, heroId: number | null) => void;
  /** Swaps the contents of two slots, which is what dragging a hero onto another one means. */
  moveSlot: (from: { side: Side; slot: number }, to: { side: Side; slot: number }) => void;
  clearAll: () => void;
  /** Replaces a whole side without counting as a manual edit, for filling the board from a match. */
  setSide: (side: Side, heroes: (number | null)[]) => void;
  /** Rearranges a side the user already drafted, so it drops the imported-match reference. */
  reorderSide: (side: Side, heroes: (number | null)[]) => void;
  /** First empty slot of a side, or `null` when it is full. */
  nextOpenSlot: (side: Side) => number | null;
}

export function useDraft(onManualEdit?: () => void): DraftControls {
  const [ally, setAlly] = useQueryState("ally", parseAsTeam.withDefault(EMPTY_SIDE));
  const [enemy, setEnemy] = useQueryState("enemy", parseAsTeam.withDefault(EMPTY_SIDE));

  const draft = useMemo<Draft>(() => ({ ally, enemy }), [ally, enemy]);

  const setSide = useCallback(
    (side: Side, heroes: (number | null)[]) => {
      const padded = [...heroes, ...EMPTY_SIDE].slice(0, TEAM_SIZE);
      const setter = side === "ally" ? setAlly : setEnemy;
      void setter(padded.every((h) => h === null) ? null : padded);
    },
    [setAlly, setEnemy],
  );

  const reorderSide = useCallback(
    (side: Side, heroes: (number | null)[]) => {
      onManualEdit?.();
      setSide(side, heroes);
    },
    [setSide, onManualEdit],
  );

  const setSlot = useCallback(
    (side: Side, slot: number, heroId: number | null) => {
      onManualEdit?.();
      const current = side === "ally" ? ally : enemy;
      const next = [...current];
      // A hero can only hold one slot per side; moving it frees the one it came from.
      if (heroId !== null) {
        const previous = next.indexOf(heroId);
        if (previous !== -1) next[previous] = null;
      }
      next[slot] = heroId;
      setSide(side, next);
    },
    [ally, enemy, setSide, onManualEdit],
  );

  const moveSlot = useCallback(
    (from: { side: Side; slot: number }, to: { side: Side; slot: number }) => {
      if (from.side === to.side && from.slot === to.slot) return;
      onManualEdit?.();
      const sides = { ally: [...ally], enemy: [...enemy] };
      const moving = sides[from.side][from.slot];
      sides[from.side][from.slot] = sides[to.side][to.slot];
      sides[to.side][to.slot] = moving;
      setSide("ally", sides.ally);
      setSide("enemy", sides.enemy);
    },
    [ally, enemy, setSide, onManualEdit],
  );

  const clearAll = useCallback(() => {
    void setAlly(null);
    void setEnemy(null);
  }, [setAlly, setEnemy]);

  const nextOpenSlot = useCallback(
    (side: Side) => {
      const index = (side === "ally" ? ally : enemy).indexOf(null);
      return index === -1 ? null : index;
    },
    [ally, enemy],
  );

  return { draft, setSlot, moveSlot, clearAll, setSide, reorderSide, nextOpenSlot };
}
