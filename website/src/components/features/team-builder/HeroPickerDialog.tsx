import { XIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { HeroGrid, HeroGridSearch, HeroGridTile } from "~/components/domain/selectors/HeroGrid";
import { useHeroPicker } from "~/components/domain/selectors/useHeroPicker";
import { PanelFooter } from "~/components/patterns/panel/Panel";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Field } from "~/components/ui/field";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Separator } from "~/components/ui/separator";
import type { Draft, Recommendation, Side, StatsIndex } from "~/lib/team-builder/analysis";
import { recommendPicks } from "~/lib/team-builder/analysis";
import { formatRate } from "~/lib/team-builder/format";
import { slotLane, TEAM_NAMES } from "~/lib/team-builder/lanes";
import type { SlimHero } from "~/queries/asset-queries";

import { DetailDialog } from "./DetailDialog";
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

interface HeroPickerDialogProps {
  target: PickerTarget | null;
  draft: Draft;
  index: StatsIndex;
  /** The playable roster, already filtered by the page so both rankings share one candidate list. */
  heroes: SlimHero[];
  onSelect: (heroId: number) => void;
  onClose: () => void;
}

export function HeroPickerDialog({ target, onClose, ...rest }: HeroPickerDialogProps) {
  return (
    <DetailDialog value={target} onClose={onClose}>
      {/* Remounting per target is what resets the search box and cursor — no effect needed. */}
      {(open) => <PickerBody key={`${open.side}-${open.slot}`} target={open} {...rest} />}
    </DetailDialog>
  );
}

function PickerBody({
  target,
  draft,
  index,
  heroes,
  onSelect,
}: Omit<HeroPickerDialogProps, "target" | "onClose"> & { target: PickerTarget }) {
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
      if (heroId !== null) onSelect(heroId);
    },
    disabledHeroIds: new Set(takenBy.keys()),
    // With nothing typed, the first tile is the best-ranked pick, so Enter takes it as the old list's cursor did.
    enterPicks: "always",
  });

  const lane = slotLane(draft.gameMode, target.slot);

  // A sort whose every hero is n/a (no ally drafted yet, or no enemy) sorts nothing; it comes back with the first hero
  // it can be measured against.
  const showSynergy = recommendations.some((r) => r.synergy !== undefined);
  const showCounter = recommendations.some((r) => r.counter !== undefined);
  const activeSort = (sort === "synergy" && !showSynergy) || (sort === "counter" && !showCounter) ? "score" : sort;

  return (
    <DialogContent
      size="lg"
      className="flex max-h-4/5 flex-col gap-0 p-0"
      showCloseButton={false}
      // A pick fills the slot, which swaps the empty slot's button that opened the picker for the hero's portrait;
      // the focus goes to that portrait, rather than to the page with the button that is gone.
      onCloseAutoFocus={(event) => {
        const slot = document.querySelector<HTMLElement>(`[data-draft-slot="${draftSlotKey(target)}"]`);
        if (!slot) return;
        event.preventDefault();
        slot.focus();
      }}
    >
      {/* The close button sits in the header row rather than the dialog's corner, where it covered the badge. */}
      {/* On a phone the search box takes a row of its own under the badge, rather than shrinking to a sliver. */}
      <DialogHeader className="flex-row flex-wrap items-center gap-2.5 p-3.5">
        <DialogTitle className="sr-only">Pick a hero</DialogTitle>
        <DialogDescription className="sr-only">
          Search the roster; every hero shows what it would add to the current draft. Enter picks the first hero, the
          arrow keys move through the grid.
        </DialogDescription>
        <HeroGridSearch
          picker={picker}
          variant="ghost"
          className="order-last basis-full @sm:order-none @sm:flex-1 @sm:basis-0"
        />
        {/* Grows on a phone, where it shares the first row with the close button alone. */}
        <div className="flex-1 text-start @sm:flex-none">
          <Badge variant="outline" className="text-2xs text-muted-foreground">
            {TEAM_NAMES[target.side]} · {lane ? lane.name : `Slot ${target.slot + 1}`}
          </Badge>
        </div>
        <DialogClose asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Close">
            <XIcon />
          </Button>
        </DialogClose>
      </DialogHeader>
      <Separator />

      <div className="flex flex-wrap items-center gap-2 px-3 py-2 @sm:px-4">
        {/* On a phone the four sorts share the row and wrap, rather than running off the dialog's edge. */}
        <Field label="Sort by" orientation="horizontal" className="min-w-0 flex-1 @md:flex-none">
          <Segmented size="sm" value={activeSort} onValueChange={setSort} className="@md:w-fit">
            <SegmentedItem value="score">{SORT_LABEL.score}</SegmentedItem>
            {showSynergy && <SegmentedItem value="synergy">{SORT_LABEL.synergy}</SegmentedItem>}
            {showCounter && <SegmentedItem value="counter">{SORT_LABEL.counter}</SegmentedItem>}
            <SegmentedItem value="winRate">{SORT_LABEL.winRate}</SegmentedItem>
          </Segmented>
        </Field>
      </div>
      <Separator />

      <div className="min-h-0 flex-1 overflow-y-auto p-2 @sm:p-3">
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

      <PanelFooter className="flex justify-between gap-2 px-3 py-2.5 text-2xs @sm:px-4">
        {/* Only where there is a keyboard to speak of: on a touch screen the hint names keys nobody has. */}
        <span className="hidden pointer-fine:inline">Enter picks the first hero, arrow keys move</span>
        <span>Numbers are against the heroes already drafted</span>
      </PanelFooter>
    </DialogContent>
  );
}
