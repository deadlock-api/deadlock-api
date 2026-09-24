import { cva } from "class-variance-authority";
import { CheckIcon, MinusIcon, PlusIcon } from "lucide-react";
import { Children, createContext, isValidElement, use, useEffect, useId, useRef } from "react";

import { type Pickable, PICKER_COLUMNS, type PickerTileState } from "~/components/patterns/picker/picker";
import type { Picker } from "~/components/patterns/picker/usePicker";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { FOCUS_RING } from "~/components/ui/recipes";
import { SearchInput } from "~/components/ui/search-input";
import { cn } from "~/lib/utils";

type GridSize = "sm" | "default" | "lg";

const PickerGridContext = createContext<{ picker: Picker; size: GridSize } | null>(null);

function usePickerGridContext(part: string) {
  const context = use(PickerGridContext);
  if (!context) throw new Error(`${part} must be used inside a PickerGrid`);
  return context;
}

/**
 * Marks a component that renders a `PickerGridGroup` (the group itself, or a wrapper such as `ItemGridTier`), so the
 * grid lays it out as a group rather than as a tile of a row.
 */
export function markPickerGridGroup<C extends object>(component: C): C {
  return Object.assign(component, { pickerGridGroup: true });
}

function isGroup(node: React.ReactNode): boolean {
  return isValidElement(node) && typeof node.type === "function" && "pickerGridGroup" in node.type;
}

/** Splits tiles into the rows of the grid, five a row. */
function Rows({ tiles }: { tiles: React.ReactNode[] }) {
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < tiles.length; i += PICKER_COLUMNS) rows.push(tiles.slice(i, i + PICKER_COLUMNS));
  return rows.map((row, i) => (
    <div
      key={isValidElement(row[0]) ? row[0].key : i}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a row of the layout grid (WAI-ARIA grid pattern)
      role="row"
      data-slot="picker-grid-row"
      className="col-span-5 grid grid-cols-subgrid"
    >
      {row}
    </div>
  ));
}

/**
 * The tiles of a picker, five a row: the hero portraits, the item shop. Its behaviour comes from `usePicker` through
 * `picker`; its children are one `PickerGridTile` per choice of `picker.matches`, in that order, either directly or
 * inside `PickerGridGroup`s (an item tier; a component that wraps a group is marked with `markPickerGridGroup`). It is a WAI-ARIA grid with a roving tabindex: one tab stop, arrows between
 * the tiles. Without tiles it shows `emptyLabel`.
 */
export function PickerGrid({
  picker,
  size = "default",
  emptyLabel = picker.search.trim() ? `Nothing matches “${picker.search.trim()}”.` : "Nothing to pick.",
  className,
  children,
  "aria-label": ariaLabel = "Choices",
  onKeyDown,
  ...props
}: React.ComponentProps<"div"> & {
  picker: Picker;
  /** `sm` packs the tiles for a chart sidebar; `lg` gives larger art and names on two lines (the item shop). */
  size?: GridSize;
  /** What the grid says without a tile: that nothing matches the search. */
  emptyLabel?: string;
}) {
  const nodes = Children.toArray(children);
  const { tileId, activeId, selection } = picker;
  const scrolled = useRef(false);
  // Opening a single picker scrolls its choice into view once, the way a native select opens on its option. A list
  // that is always on the page (a chart sidebar) never scrolls on its own.
  useEffect(() => {
    if (scrolled.current || activeId === undefined || selection !== "single") return;
    scrolled.current = true;
    const tile = document.getElementById(tileId(activeId));
    if (tile?.dataset.state !== "none") tile?.scrollIntoView({ block: "nearest" });
  }, [activeId, tileId, selection]);
  if (nodes.length === 0) {
    return <EmptyState variant="inline" title={emptyLabel} className={cn("py-4", className)} />;
  }
  // Loose tiles between groups form rows of their own; a group lays out its own rows under its heading.
  const blocks: React.ReactNode[] = [];
  let loose: React.ReactNode[] = [];
  const flush = () => {
    if (loose.length > 0) blocks.push(<Rows key={`rows-${blocks.length}`} tiles={loose} />);
    loose = [];
  };
  for (const node of nodes) {
    if (isGroup(node)) {
      flush();
      blocks.push(node);
    } else loose.push(node);
  }
  flush();
  return (
    <PickerGridContext value={{ picker, size }}>
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role, jsx-a11y/interactive-supports-focus -- a layout grid of pickable tiles (WAI-ARIA grid pattern): a table would not wrap into five columns, and with a roving tabindex the tiles take focus, not the grid */}
      <div
        id={picker.gridId}
        data-slot="picker-grid"
        data-size={size}
        data-selection={picker.selection}
        role="grid"
        aria-label={ariaLabel}
        aria-multiselectable={picker.selection === "single" ? undefined : true}
        className={cn("@container grid grid-cols-5 gap-1", className)}
        {...props}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (!event.defaultPrevented) picker.onGridKeyDown(event);
        }}
      >
        {blocks}
      </div>
    </PickerGridContext>
  );
}

/**
 * A named run of tiles inside a `PickerGrid`, such as one tier of the item shop: a heading row (`label`, with `hint`
 * after it in muted text) over its own rows of five. Children are `PickerGridTile`s. Arrow keys cross from one group
 * into the next as the rows are drawn.
 */
export function PickerGridGroup({
  label,
  hint,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children?: React.ReactNode;
}) {
  usePickerGridContext("PickerGridGroup");
  const headingId = useId();
  return (
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a group of rows of the layout grid
      role="rowgroup"
      data-slot="picker-grid-group"
      aria-labelledby={headingId}
      className={cn("col-span-5 grid grid-cols-subgrid gap-1 not-first:pt-2", className)}
      {...props}
    >
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the heading row of the group */}
      <div role="row" data-slot="picker-grid-group-header" className="col-span-5 grid">
        <div
          id={headingId}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- names the tiles below it, like a table's header cell
          role="columnheader"
          aria-colspan={PICKER_COLUMNS}
          className="flex items-baseline gap-1.5 px-1 eyebrow"
        >
          {label}
          {hint !== undefined && <span className="text-muted-foreground tabular-nums">{hint}</span>}
        </div>
      </div>
      <Rows tiles={Children.toArray(children)} />
    </div>
  );
}

markPickerGridGroup(PickerGridGroup);

const tileVariants = cva(
  cn(
    FOCUS_RING,
    "relative flex w-full min-w-0 cursor-pointer flex-col items-center rounded-md transition-colors",
    "aria-disabled:cursor-default aria-disabled:opacity-40",
  ),
  {
    variants: {
      state: {
        none: "hover:bg-accent aria-disabled:hover:bg-transparent",
        selected: "bg-primary/15 ring-1 ring-primary/40 ring-inset hover:bg-primary/20",
        included: "bg-positive/15 ring-1 ring-positive/60 ring-inset hover:bg-positive/20",
        excluded: "bg-negative/15 ring-1 ring-negative/60 ring-inset hover:bg-negative/20",
      },
      size: { default: "gap-1 p-1.5", sm: "gap-0.5 px-0.5 py-1", lg: "gap-1 p-1.5" },
    },
    defaultVariants: { state: "none", size: "default" },
  },
);

// The art fills this box (pass it `size-full`); an excluded choice's art is dimmed like `AssetImage emphasis="dim"`.
const mediaVariants = cva("flex shrink-0 items-center justify-center transition-[filter,opacity]", {
  variants: {
    size: { default: "size-7 @3xs:size-9", sm: "size-6 @3xs:size-8", lg: "size-8 @3xs:size-11" },
    state: { none: "", selected: "", included: "", excluded: "opacity-40 saturate-50" },
  },
  defaultVariants: { size: "default", state: "none" },
});

const nameVariants = cva("w-full text-center text-3xs leading-tight text-muted-foreground", {
  variants: { size: { default: "truncate", sm: "truncate", lg: "line-clamp-2 break-words hyphens-auto" } },
  defaultVariants: { size: "default" },
});

const markVariants = cva(
  "pointer-events-none absolute inset-e-0.5 top-0.5 flex size-3.5 items-center justify-center rounded-full text-primary-foreground [&_svg]:size-2.5",
  {
    variants: {
      state: { selected: "bg-primary", included: "bg-positive", excluded: "bg-negative" },
    },
  },
);

const MARK_ICON = { selected: CheckIcon, included: PlusIcon, excluded: MinusIcon } as const;
const STATE_WORD: Record<PickerTileState, string> = {
  none: "",
  selected: "",
  included: ", included",
  excluded: ", excluded",
};

/**
 * One choice of a `PickerGrid`: its art (`media`, decorative: the name names the tile; the art takes `size-full` and
 * the grid sizes it), its name, and children as an
 * extra line under the name, such as the number a list is sorted by. Its state (none, selected, included, excluded)
 * comes from the picker and shows as a ring and a corner mark (a check, a plus, a minus), never as color alone; a
 * tri-state choice's name says it ("Vyper, included"). A choice in `disabledIds` stays focusable but cannot be picked;
 * `title` gives the reason. Props and `ref` reach the button.
 */
export function PickerGridTile({
  choice,
  media,
  className,
  children,
  title,
  onClick,
  onFocus,
  ...props
}: Omit<React.ComponentProps<"button">, "value"> & {
  choice: Pickable;
  /** The art above the name, sized by the grid: a portrait, an item icon. */
  media?: React.ReactNode;
}) {
  const { picker, size } = usePickerGridContext("PickerGridTile");
  const state = picker.stateOf(choice.id);
  const disabled = picker.isDisabled(choice.id);
  const metaId = useId();
  const reasonId = useId();
  const Mark = state === "none" ? null : MARK_ICON[state];
  const pressable = picker.selection !== "tri-state";
  const hasMeta = children !== undefined && children !== null && children !== false;
  const reason = disabled && title ? title : undefined;
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a cell of the layout grid; the button inside is the control
    <div role="gridcell" data-slot="picker-grid-cell" className="flex min-w-0">
      {/* ds-allow raw-button: a picker tile, the hit area of a bespoke selection grid */}
      <button
        id={picker.tileId(choice.id)}
        type="button"
        data-slot="picker-grid-tile"
        data-state={state}
        data-picker-id={choice.id}
        tabIndex={picker.activeId === choice.id ? 0 : -1}
        aria-label={`${choice.name}${STATE_WORD[state]}`}
        aria-pressed={pressable ? state === "selected" : undefined}
        aria-disabled={disabled || undefined}
        aria-describedby={[hasMeta && metaId, reason && reasonId].filter(Boolean).join(" ") || undefined}
        title={title ?? choice.name}
        className={cn(tileVariants({ state, size }), className)}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) picker.pick(choice.id);
        }}
        onFocus={(event) => {
          onFocus?.(event);
          picker.setActiveId(choice.id);
        }}
        {...props}
      >
        {media !== undefined && (
          <span aria-hidden="true" data-slot="picker-grid-tile-media" className={mediaVariants({ size, state })}>
            {media}
          </span>
        )}
        <span className={nameVariants({ size })}>{choice.name}</span>
        {hasMeta && (
          <span
            id={metaId}
            data-slot="picker-grid-tile-meta"
            className="flex w-full justify-center truncate text-3xs leading-tight font-medium tabular-nums"
          >
            {children}
          </span>
        )}
        {reason && (
          <span id={reasonId} className="sr-only">
            {reason}
          </span>
        )}
        {Mark && (
          <span
            aria-hidden="true"
            data-slot="picker-grid-tile-mark"
            className={markVariants({ state: state as never })}
          >
            <Mark strokeWidth={3} />
          </span>
        )}
      </button>
    </div>
  );
}

/**
 * The search box above a `PickerGrid`: it narrows `picker.matches`, Enter picks the first match and ArrowDown moves
 * into the grid. Props reach `SearchInput`; give it an `aria-label` that names what it searches.
 */
export function PickerGridSearch({
  picker,
  size = "sm",
  placeholder = "Search…",
  "aria-label": ariaLabel = "Search",
  onKeyDown,
  ...props
}: Omit<React.ComponentProps<typeof SearchInput>, "value" | "defaultValue" | "onValueChange"> & {
  picker: Pick<Picker, "searchId" | "gridId" | "search" | "setSearch" | "onSearchKeyDown">;
}) {
  return (
    <SearchInput
      id={picker.searchId}
      size={size}
      aria-label={ariaLabel}
      aria-controls={picker.gridId}
      autoComplete="off"
      placeholder={placeholder}
      value={picker.search}
      onValueChange={picker.setSearch}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (!event.defaultPrevented) picker.onSearchKeyDown(event);
      }}
      {...props}
    />
  );
}
