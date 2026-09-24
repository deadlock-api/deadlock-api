import { useMemo, useState } from "react";

import { HeroGrid, HeroGridSearch, HeroGridTile } from "~/components/domain/selectors/HeroGrid";
import { useHeroPicker } from "~/components/domain/selectors/useHeroPicker";
import { Field } from "~/components/ui/field";
import { Popover, PopoverAnchor, PopoverContent } from "~/components/ui/popover";
import { SCROLLBAR_THIN } from "~/components/ui/recipes";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Separator } from "~/components/ui/separator";
import type { Draft, Recommendation, Side, StatsIndex } from "~/lib/team-builder/analysis";
import { recommendPicks } from "~/lib/team-builder/analysis";
import { formatRate } from "~/lib/team-builder/format";
import { slotLane, TEAM_NAMES } from "~/lib/team-builder/lanes";
import { cn } from "~/lib/utils";
import type { SlimHero } from "~/queries/asset-queries";

import { draftSlotKey } from "./DraftSlot";
import { Points } from "./Points";

/** Every key is a numeric field of `Recommendation`, which is what lets the sort read it directly. */
type SortKey = "score" | "synergy" | "counter" | "winRate";

const SORT_LABEL: Record<SortKey, string> = {
  score: "Score",
  synergy: "Synergy",
  counter: "Vs. enemy",
  winRate: "Win rate",
};

/** The number a tile shows under the hero's name: the value the roster is sorted by. */
function SortValue({ sort, row }: { sort: SortKey; row: Recommendation }) {
  return (
    <>
      <span className="sr-only">{SORT_LABEL[sort]} </span>
      {sort === "winRate" ? formatRate(row.winRate) : <Points value={row[sort]} />}
    </>
  );
}

export interface PickerTarget {
  side: Side;
  slot: number;
}

interface HeroPickerProps {
  target: PickerTarget | null;
  draft: Draft;
  index: StatsIndex;
  /** The playable roster, already filtered by the page so both rankings share one candidate list. */
  heroes: SlimHero[];
  onSelect: (heroId: number) => void;
  onClose: () => void;
}

const slotElement = (target: PickerTarget) =>
  document.querySelector<HTMLElement>(`[data-draft-slot="${draftSlotKey(target)}"]`);

/**
 * The Team Builder's hero select: a popover on the slot being filled, like every other hero select, whose trigger is
 * the slot's portrait. After a pick the page moves `target` to the next empty slot and the popover follows it there
 * without closing: a dialog that remounted per slot flashed shut and open between picks.
 */
export function HeroPicker({ target, onClose, ...rest }: HeroPickerProps) {
  // The anchor is whichever slot is being filled, measured when the popover positions itself.
  const anchor = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () =>
          (target ? slotElement(target)?.getBoundingClientRect() : undefined) ?? new DOMRect(),
      },
    }),
    [target],
  );
  return (
    <Popover
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <PopoverAnchor virtualRef={anchor} />
      {target && (
        <PopoverContent
          // The popover points at the slot it fills; the slot's team and lane are in its name for a screen reader.
          aria-label={`Pick a hero for ${TEAM_NAMES[target.side]}, ${slotLane(rest.draft.gameMode, target.slot)?.name ?? `slot ${target.slot + 1}`}`}
          align="center"
          collisionPadding={8}
          className="flex max-h-(--radix-popover-content-available-height) w-80 max-w-(--radix-popover-content-available-width) flex-col p-0"
          // Pressing another slot moves the picker there (the slot's own click retargets it) instead of closing it.
          onInteractOutside={(event) => {
            if (event.target instanceof Element && event.target.closest("[data-draft-slot]")) event.preventDefault();
          }}
          // A pick fills the slot, swapping its empty button for the hero's portrait; the focus goes to that portrait,
          // rather than to the page with the button that is gone.
          onCloseAutoFocus={(event) => {
            const slot = slotElement(target);
            if (!slot) return;
            event.preventDefault();
            slot.focus();
          }}
        >
          <PickerBody target={target} {...rest} />
        </PopoverContent>
      )}
    </Popover>
  );
}

function PickerBody({
  target,
  draft,
  index,
  heroes,
  onSelect,
}: Omit<HeroPickerProps, "target" | "onClose"> & { target: PickerTarget }) {
  const [sort, setSort] = useState<SortKey>("score");

  const recommendations = useMemo(
    () =>
      recommendPicks(
        draft,
        index,
        target.side,
        heroes.map((h) => h.id),
      ),
    [target.side, draft, index, heroes],
  );

  // Where each drafted hero sits, so the picker shows them as taken rather than leaving them out.
  const takenBy = useMemo(() => {
    const map = new Map<number, string>();
    for (const side of ["ally", "enemy"] as const) {
      draft[side].forEach((heroId, slot) => {
        if (heroId === null) return;
        const own = side === target.side && slot === target.slot;
        const where = slotLane(draft.gameMode, slot)?.name ?? `slot ${slot + 1}`;
        map.set(heroId, own ? "in this slot" : `${TEAM_NAMES[side]} · ${where}`);
      });
    }
    return map;
  }, [draft, target]);

  const byId = useMemo(() => new Map(recommendations.map((r) => [r.heroId, r])), [recommendations]);

  // The ranked candidates first, by the chosen sort, then the drafted heroes by name, which cannot be picked again.
  const roster = useMemo(() => {
    const names = new Map(heroes.map((h) => [h.id, h.name]));
    const ranked = [...recommendations]
      .sort((a, b) => (b[sort] ?? Number.NEGATIVE_INFINITY) - (a[sort] ?? Number.NEGATIVE_INFINITY))
      .map((r) => ({ id: r.heroId, name: names.get(r.heroId) ?? "Unknown" }));
    const taken = [...takenBy.keys()]
      .map((id) => ({ id, name: names.get(id) ?? "Unknown" }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...ranked, ...taken];
  }, [recommendations, takenBy, heroes, sort]);

  const picker = useHeroPicker({
    heroes: roster,
    value: null,
    onValueChange: (heroId) => {
      if (heroId === null) return;
      // The next slot starts from the whole roster.
      picker.setSearch("");
      onSelect(heroId);
    },
    disabledHeroIds: new Set(takenBy.keys()),
    // With nothing typed, the first tile is the best-ranked pick, so Enter takes it as the old list's cursor did.
    enterPicks: "always",
  });

  // A sort whose every hero is n/a (no ally drafted yet, or no enemy) sorts nothing; it comes back with the first hero
  // it can be measured against.
  const showSynergy = recommendations.some((r) => r.synergy !== undefined);
  const showCounter = recommendations.some((r) => r.counter !== undefined);
  const activeSort = (sort === "synergy" && !showSynergy) || (sort === "counter" && !showCounter) ? "score" : sort;

  return (
    <>
      {/* The search box first, like every hero select: it is where the focus lands, so typing and Enter pick. */}
      <div className="flex flex-col gap-2 p-2">
        <HeroGridSearch picker={picker} />
        <Field label="Sort" orientation="horizontal">
          <Segmented size="sm" value={activeSort} onValueChange={setSort}>
            <SegmentedItem value="score">{SORT_LABEL.score}</SegmentedItem>
            {showSynergy && <SegmentedItem value="synergy">{SORT_LABEL.synergy}</SegmentedItem>}
            {showCounter && <SegmentedItem value="counter">{SORT_LABEL.counter}</SegmentedItem>}
            <SegmentedItem value="winRate">{SORT_LABEL.winRate}</SegmentedItem>
          </Segmented>
        </Field>
      </div>
      <Separator />
      <div className={cn(SCROLLBAR_THIN, "min-h-0 flex-1 overflow-y-auto p-2")}>
        <HeroGrid picker={picker} aria-label="Heroes">
          {picker.matches.map((hero) => {
            const row = byId.get(hero.id);
            const where = takenBy.get(hero.id);
            return (
              <HeroGridTile
                key={hero.id}
                hero={hero}
                title={where ? `${hero.name}: already drafted, ${where}` : undefined}
              >
                {row ? <SortValue sort={activeSort} row={row} /> : where === "in this slot" ? "This slot" : "Drafted"}
              </HeroGridTile>
            );
          })}
        </HeroGrid>
      </div>
      <Separator />
      <p className="px-3 py-2 text-2xs text-muted-foreground">Numbers are against the heroes already drafted.</p>
    </>
  );
}
