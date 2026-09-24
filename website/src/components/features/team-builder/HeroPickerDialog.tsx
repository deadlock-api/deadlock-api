import { XIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { PanelFooter, PanelSection } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { OptionRow } from "~/components/ui/option-row";
import { SearchInput } from "~/components/ui/search-input";
import { Separator } from "~/components/ui/separator";
import { SortButton } from "~/components/ui/sort-button";
import type { Draft, Side, StatsIndex } from "~/lib/team-builder/analysis";
import { recommendPicks } from "~/lib/team-builder/analysis";
import { formatRate } from "~/lib/team-builder/format";
import { slotLane, TEAM_NAMES } from "~/lib/team-builder/lanes";
import { cn } from "~/lib/utils";
import type { SlimHero } from "~/queries/asset-queries";

import { DetailDialog } from "./DetailDialog";
import { draftSlotKey } from "./DraftSlot";
import { Points } from "./Points";

/** Every key is a numeric field of `Recommendation`, which is what lets the sort read it directly. */
type SortKey = "score" | "synergy" | "counter" | "winRate";

function SortHeader({
  column,
  sort,
  onSortChange,
  align = "end",
  className,
  children,
}: {
  column: SortKey;
  sort: SortKey;
  onSortChange: (key: SortKey) => void;
  align?: "start" | "end";
  className?: string;
  children: React.ReactNode;
}) {
  const active = sort === column;
  return (
    <SortButton
      active={active}
      sortDir="desc"
      align={align}
      onClick={() => onSortChange(column)}
      className={cn(active && "text-foreground", className)}
    >
      {children}
    </SortButton>
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
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("score");
  const [rawCursor, setCursor] = useState(0);
  const listId = useId();
  const optionId = (heroId: number) => `${listId}-${heroId}`;

  const namesById = useMemo(() => new Map(heroes.map((h) => [h.id, h.name])), [heroes]);

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

  // Where each drafted hero sits, so the picker can list them as taken rather than omitting them.
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

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return recommendations
      .filter((r) => !term || (namesById.get(r.heroId) ?? "").toLowerCase().includes(term))
      .sort((a, b) => (b[sort] ?? Number.NEGATIVE_INFINITY) - (a[sort] ?? Number.NEGATIVE_INFINITY));
  }, [recommendations, search, sort, namesById]);

  const takenRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...takenBy.keys()]
      .filter((heroId) => !term || (namesById.get(heroId) ?? "").toLowerCase().includes(term))
      .sort((a, b) => (namesById.get(a) ?? "").localeCompare(namesById.get(b) ?? ""));
  }, [takenBy, search, namesById]);

  const cursor = Math.min(rawCursor, Math.max(0, rows.length - 1));

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = Math.max(0, Math.min(rows.length - 1, cursor + (event.key === "ArrowDown" ? 1 : -1)));
      setCursor(next);
      if (rows[next]) document.getElementById(optionId(rows[next].heroId))?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && rows[cursor]) {
      event.preventDefault();
      onSelect(rows[cursor].heroId);
    }
  };

  const lane = slotLane(draft.gameMode, target.slot);

  // A delta column whose every row is n/a (no ally drafted yet, or no enemy) only takes room from the names,
  // which a phone then cut to a letter or two. It comes back with the first hero it can be measured against.
  const showSynergy = recommendations.some((r) => r.synergy !== undefined);
  const showCounter = recommendations.some((r) => r.counter !== undefined);
  // A phone's dialog gets narrower number columns and edges, and on the smallest screens no portrait, so the
  // hero's name keeps room to be read rather than cut to a letter.
  const deltaColumn = "w-14 @md:w-20";
  const rateColumn = showSynergy || showCounter ? "w-14 @sm:w-18" : "w-18";
  const edge = "px-3 @sm:px-4";
  const portrait = "hidden size-7.5 shrink-0 @xs:block";

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
          Search the roster; every row shows what the hero would add to the current draft.
        </DialogDescription>
        <SearchInput
          variant="ghost"
          size="sm"
          value={search}
          onValueChange={setSearch}
          onKeyDown={handleKeyDown}
          placeholder="Search heroes…"
          aria-label="Search heroes"
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- SearchInput already renders a native text input; this is the WAI-ARIA combobox pattern
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={rows[cursor] ? optionId(rows[cursor].heroId) : undefined}
          autoComplete="off"
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

      <div className={cn("flex py-2 eyebrow", edge)}>
        <SortHeader column="score" sort={sort} onSortChange={setSort} align="start" className="flex-1">
          Hero
        </SortHeader>
        {showSynergy && (
          <SortHeader column="synergy" sort={sort} onSortChange={setSort} className={deltaColumn}>
            Synergy
          </SortHeader>
        )}
        {showCounter && (
          <SortHeader column="counter" sort={sort} onSortChange={setSort} className={deltaColumn}>
            Vs. enemy
          </SortHeader>
        )}
        <SortHeader column="winRate" sort={sort} onSortChange={setSort} className={rateColumn}>
          Win rate
        </SortHeader>
      </div>
      <Separator />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 && takenRows.length === 0 && (
          <EmptyState variant="inline" title={`No hero matches “${search}”.`} className="py-10" />
        )}
        {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the popup list of a custom combobox; a native select or datalist cannot carry it */}
        <div role="listbox" id={listId} aria-label="Heroes">
          {rows.map((row, i) => (
            <OptionRow
              key={row.heroId}
              id={optionId(row.heroId)}
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an option of the ARIA listbox above; a native option only exists inside a native select
              role="option"
              aria-selected={i === cursor}
              // The search box keeps the focus and owns the cursor; the rows are reached with the arrow keys.
              tabIndex={-1}
              selected={false}
              active={i === cursor}
              onMouseEnter={() => setCursor(i)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(row.heroId)}
              className={cn(edge, "py-2.5")}
              leading={<HeroImage heroId={row.heroId} shape="circle" className={portrait} aria-hidden />}
              // One element, so the row's own gap between trailing parts cannot shift the columns off the header's.
              trailing={
                <span className="flex items-center">
                  {showSynergy && (
                    <Points value={row.synergy} align="end" className={cn(deltaColumn, "font-semibold")} />
                  )}
                  {showCounter && (
                    <Points value={row.counter} align="end" className={cn(deltaColumn, "font-semibold")} />
                  )}
                  <span className={cn(rateColumn, "text-end tabular-nums")}>{formatRate(row.winRate)}</span>
                </span>
              }
            >
              {namesById.get(row.heroId) ?? "Unknown"}
            </OptionRow>
          ))}

          {takenRows.length > 0 && (
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a group of options inside an ARIA listbox; optgroup only exists inside a native select
            <div role="group" aria-labelledby={`${listId}-taken`}>
              <PanelSection id={`${listId}-taken`} title="Already drafted" />
              {takenRows.map((heroId) => (
                <OptionRow
                  key={heroId}
                  id={optionId(heroId)}
                  // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an option of the ARIA listbox above; a native option only exists inside a native select
                  role="option"
                  aria-selected={false}
                  aria-disabled
                  tabIndex={-1}
                  selected={false}
                  className={cn(edge, "py-2.5")}
                  leading={<HeroImage heroId={heroId} shape="circle" className={portrait} aria-hidden />}
                  trailing={<span className="text-2xs text-muted-foreground">{takenBy.get(heroId)}</span>}
                >
                  {namesById.get(heroId) ?? "Unknown"}
                </OptionRow>
              ))}
            </div>
          )}
        </div>
      </div>

      <PanelFooter className={cn("flex justify-between gap-2 py-2.5 text-2xs", edge)}>
        {/* Only where there is a keyboard to speak of: on a touch screen the hint names keys nobody has. */}
        <span className="hidden pointer-fine:inline">Arrow keys to move, Enter to pick</span>
        <span>Deltas are against the heroes already drafted</span>
      </PanelFooter>
    </DialogContent>
  );
}
