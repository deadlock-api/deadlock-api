import type { Hero } from "deadlock_api_client";
import { SearchIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import type { Draft, Side, StatsIndex } from "~/lib/team-builder/analysis";
import { recommendPicks } from "~/lib/team-builder/analysis";
import { deltaClass, formatPoints, formatRate } from "~/lib/team-builder/format";
import { slotLane, TEAM_NAMES } from "~/lib/team-builder/lanes";
import { cn } from "~/lib/utils";

import { DetailDialog } from "./DetailDialog";
import { HeroPortrait } from "./HeroPortrait";

/** Every key is a numeric field of `Recommendation`, which is what lets the sort read it directly. */
type SortKey = "score" | "synergy" | "counter" | "winRate";

function SortHeader({
  column,
  sort,
  onSort,
  className,
  children,
}: {
  column: SortKey;
  sort: SortKey;
  onSort: (key: SortKey) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const active = sort === column;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={cn(
        "cursor-pointer tracking-[0.05em] uppercase transition-colors hover:text-foreground",
        active && "text-foreground",
        className,
      )}
    >
      {children}
      {active && " ↓"}
    </button>
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
  heroes: Hero[];
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
    <DialogContent className="flex max-h-[80dvh] flex-col gap-0 p-0 sm:max-w-2xl" showCloseButton={false}>
      <DialogHeader className="flex-row items-center gap-2.5 space-y-0 border-b border-border p-3.5">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
        <DialogTitle className="sr-only">Pick a hero</DialogTitle>
        <DialogDescription className="sr-only">
          Search the roster; every row shows what the hero would add to the current draft.
        </DialogDescription>
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search heroes…"
          className="h-7 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
        <Badge variant="outline" className="text-[11px] text-muted-foreground">
          {TEAM_NAMES[target.side]} · {lane ? lane.name : `Slot ${target.slot + 1}`}
        </Badge>
      </DialogHeader>

      <div className="flex border-b border-border px-4 py-2 text-[11px] text-muted-foreground">
        <SortHeader column="score" sort={sort} onSort={setSort} className="flex-1 text-left">
          Hero
        </SortHeader>
        <SortHeader column="synergy" sort={sort} onSort={setSort} className="w-20 text-right">
          Synergy
        </SortHeader>
        <SortHeader column="counter" sort={sort} onSort={setSort} className="w-20 text-right">
          Vs. enemy
        </SortHeader>
        <SortHeader column="winRate" sort={sort} onSort={setSort} className="w-18 text-right">
          Win rate
        </SortHeader>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 && takenRows.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No hero matches “{search}”.</p>
        )}
        {rows.map((row, i) => (
          <button
            key={row.heroId}
            type="button"
            onMouseEnter={() => setCursor(i)}
            onClick={() => onSelect(row.heroId)}
            className={cn(
              "flex w-full cursor-pointer items-center border-b border-border/60 px-4 py-2.5 text-left text-[13px]",
              i === cursor && "bg-primary/8",
            )}
          >
            <span className="flex flex-1 items-center gap-2.5">
              <HeroPortrait heroId={row.heroId} size="size-7.5" />
              {namesById.get(row.heroId) ?? "Unknown"}
            </span>
            <span className={cn("w-20 text-right font-semibold tabular-nums", deltaClass(row.synergy))}>
              {formatPoints(row.synergy)}
            </span>
            <span className={cn("w-20 text-right font-semibold tabular-nums", deltaClass(row.counter))}>
              {formatPoints(row.counter)}
            </span>
            <span className="w-18 text-right tabular-nums">{formatRate(row.winRate)}</span>
          </button>
        ))}

        {takenRows.length > 0 && (
          <>
            <div className="border-b border-border bg-white/[0.02] px-4 py-1.5 text-[11px] text-muted-foreground">
              Already drafted
            </div>
            {takenRows.map((heroId) => (
              <div
                key={heroId}
                className="flex w-full items-center gap-2.5 border-b border-border/60 px-4 py-2.5 text-[13px] opacity-45"
              >
                <HeroPortrait heroId={heroId} size="size-7.5" />
                <span className="flex-1">{namesById.get(heroId) ?? "Unknown"}</span>
                <span className="text-[11px] text-muted-foreground">{takenBy.get(heroId)}</span>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="flex justify-between border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
        <span>Arrow keys to move, Enter to pick</span>
        <span>Deltas are against the heroes already drafted</span>
      </div>
    </DialogContent>
  );
}
