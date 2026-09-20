import { useMemo, useRef, useState } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { PanelFooter, PanelSection } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { Badge } from "~/components/ui/badge";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
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
import { Points } from "./Points";

/** Every key is a numeric field of `Recommendation`, which is what lets the sort read it directly. */
type SortKey = "score" | "synergy" | "counter" | "winRate";

function SortHeader({
  column,
  sort,
  onSort,
  align = "end",
  className,
  children,
}: {
  column: SortKey;
  sort: SortKey;
  onSort: (key: SortKey) => void;
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
      onClick={() => onSort(column)}
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
  const listRef = useRef<HTMLDivElement>(null);

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
      listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && rows[cursor]) {
      event.preventDefault();
      onSelect(rows[cursor].heroId);
    }
  };

  const lane = slotLane(draft.gameMode, target.slot);

  return (
    <DialogContent size="lg" className="flex max-h-4/5 flex-col gap-0 p-0" showCloseButton={false}>
      <DialogHeader className="flex-row items-center gap-2.5 p-3.5">
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
          className="flex-1"
        />
        <Badge variant="outline" className="text-2xs text-muted-foreground">
          {TEAM_NAMES[target.side]} · {lane ? lane.name : `Slot ${target.slot + 1}`}
        </Badge>
      </DialogHeader>
      <Separator />

      <div className="flex px-4 py-2 eyebrow">
        <SortHeader column="score" sort={sort} onSort={setSort} align="start" className="flex-1">
          Hero
        </SortHeader>
        <SortHeader column="synergy" sort={sort} onSort={setSort} className="w-20">
          Synergy
        </SortHeader>
        <SortHeader column="counter" sort={sort} onSort={setSort} className="w-20">
          Vs. enemy
        </SortHeader>
        <SortHeader column="winRate" sort={sort} onSort={setSort} className="w-18">
          Win rate
        </SortHeader>
      </div>
      <Separator />

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 && takenRows.length === 0 && (
          <EmptyState variant="inline" title={`No hero matches “${search}”.`} className="py-10" />
        )}
        {rows.map((row, i) => (
          <OptionRow
            key={row.heroId}
            selected={false}
            active={i === cursor}
            onMouseEnter={() => setCursor(i)}
            onClick={() => onSelect(row.heroId)}
            className="px-4 py-2.5"
            leading={<HeroImage heroId={row.heroId} shape="circle" className="size-7.5 shrink-0" />}
            // One element, so the row's own gap between trailing parts cannot shift the columns off the header's.
            trailing={
              <span className="flex items-center">
                <Points value={row.synergy} align="end" className="w-20 font-semibold" />
                <Points value={row.counter} align="end" className="w-20 font-semibold" />
                <span className="w-18 text-end tabular-nums">{formatRate(row.winRate)}</span>
              </span>
            }
          >
            {namesById.get(row.heroId) ?? "Unknown"}
          </OptionRow>
        ))}

        {takenRows.length > 0 && (
          <>
            <PanelSection title="Already drafted" />
            {takenRows.map((heroId) => (
              <OptionRow
                key={heroId}
                selected={false}
                disabled
                className="px-4 py-2.5"
                leading={<HeroImage heroId={heroId} shape="circle" className="size-7.5 shrink-0" />}
                trailing={<span className="text-2xs text-muted-foreground">{takenBy.get(heroId)}</span>}
              >
                {namesById.get(heroId) ?? "Unknown"}
              </OptionRow>
            ))}
          </>
        )}
      </div>

      <PanelFooter className="flex justify-between gap-2 px-4 py-2.5 text-2xs">
        <span>Arrow keys to move, Enter to pick</span>
        <span>Deltas are against the heroes already drafted</span>
      </PanelFooter>
    </DialogContent>
  );
}
