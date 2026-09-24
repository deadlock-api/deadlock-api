import { cva } from "class-variance-authority";
import { CheckIcon, MinusIcon, PlusIcon } from "lucide-react";
import { Children, createContext, isValidElement, use, useEffect, useId, useRef } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HERO_GRID_COLUMNS, type HeroTileState, type PickableHero } from "~/components/domain/selectors/hero-picker";
import type { HeroPicker } from "~/components/domain/selectors/useHeroPicker";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { FOCUS_RING } from "~/components/ui/recipes";
import { SearchInput } from "~/components/ui/search-input";
import { cn } from "~/lib/utils";

type GridSize = "sm" | "default";

const HeroGridContext = createContext<{ picker: HeroPicker; size: GridSize } | null>(null);

function useHeroGridContext(part: string) {
  const context = use(HeroGridContext);
  if (!context) throw new Error(`${part} must be used inside a HeroGrid`);
  return context;
}

/**
 * The portraits of a hero picker, five a row. Every hero selector draws its heroes with it: the `HeroSelector` popover,
 * the chart sidebar and the Team Builder's picker. Its behaviour comes from `useHeroPicker` through `picker`; its
 * children are one `HeroGridTile` per hero of `picker.matches`, in that order. It is a WAI-ARIA grid with a roving
 * tabindex: one tab stop, arrows between the tiles. Without tiles it says that no hero matches the search.
 */
export function HeroGrid({
  picker,
  size = "default",
  className,
  children,
  "aria-label": ariaLabel = "Heroes",
  onKeyDown,
  ...props
}: React.ComponentProps<"div"> & {
  picker: HeroPicker;
  /** `sm` packs the portraits for a chart sidebar. */
  size?: GridSize;
}) {
  const tiles = Children.toArray(children);
  const { tileId, activeId, selection } = picker;
  const scrolled = useRef(false);
  // Opening a single picker scrolls its chosen hero into view once, the way a native select opens on its option. A
  // list that is always on the page (a chart sidebar) never scrolls on its own.
  useEffect(() => {
    if (scrolled.current || activeId === undefined || selection !== "single") return;
    scrolled.current = true;
    const tile = document.getElementById(tileId(activeId));
    if (tile?.dataset.state !== "none") tile?.scrollIntoView({ block: "nearest" });
  }, [activeId, tileId, selection]);
  if (tiles.length === 0) {
    return (
      <EmptyState
        variant="inline"
        title={picker.search.trim() ? `No hero matches “${picker.search.trim()}”.` : "No heroes."}
        className={cn("py-4", className)}
      />
    );
  }
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < tiles.length; i += HERO_GRID_COLUMNS) rows.push(tiles.slice(i, i + HERO_GRID_COLUMNS));
  return (
    <HeroGridContext value={{ picker, size }}>
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role, jsx-a11y/interactive-supports-focus -- a layout grid of pickable portraits (WAI-ARIA grid pattern): a table would not wrap into five columns, and with a roving tabindex the tiles take focus, not the grid */}
      <div
        id={picker.gridId}
        data-slot="hero-grid"
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
        {rows.map((row, i) => (
          <div
            key={isValidElement(row[0]) ? row[0].key : i}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a row of the layout grid above
            role="row"
            data-slot="hero-grid-row"
            className="col-span-5 grid grid-cols-subgrid"
          >
            {row}
          </div>
        ))}
      </div>
    </HeroGridContext>
  );
}

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
      size: { default: "gap-1 p-1.5", sm: "gap-0.5 px-0.5 py-1" },
    },
    defaultVariants: { state: "none", size: "default" },
  },
);

const markVariants = cva(
  "pointer-events-none absolute inset-e-0.5 top-0.5 flex size-3.5 items-center justify-center rounded-full text-primary-foreground [&_svg]:size-2.5",
  {
    variants: {
      state: { selected: "bg-primary", included: "bg-positive", excluded: "bg-negative" },
    },
  },
);

const MARK_ICON = { selected: CheckIcon, included: PlusIcon, excluded: MinusIcon } as const;
const STATE_WORD: Record<HeroTileState, string> = {
  none: "",
  selected: "",
  included: ", included",
  excluded: ", excluded",
};

/**
 * One hero of a `HeroGrid`. Its state (none, selected, included, excluded) comes from the picker and shows as a
 * ring and a corner mark (a check, a plus, a minus), never as color alone; a tri-state hero's name says it
 * ("Vyper, included"). Children are an extra line under the name, such as the number a list is sorted by. A hero
 * in `disabledHeroIds` stays focusable but cannot be picked; `title` gives the reason. Props and `ref` reach the button.
 */
export function HeroGridTile({
  hero,
  className,
  children,
  title,
  onClick,
  onFocus,
  ...props
}: Omit<React.ComponentProps<"button">, "value"> & { hero: PickableHero }) {
  const { picker, size } = useHeroGridContext("HeroGridTile");
  const state = picker.stateOf(hero.id);
  const disabled = picker.isDisabled(hero.id);
  const metaId = useId();
  const reasonId = useId();
  const Mark = state === "none" ? null : MARK_ICON[state];
  const pressable = picker.selection !== "tri-state";
  const hasMeta = children !== undefined && children !== null && children !== false;
  const reason = disabled && title ? title : undefined;
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a cell of the layout grid; the button inside is the control
    <div role="gridcell" data-slot="hero-grid-cell" className="flex min-w-0">
      {/* ds-allow raw-button: a portrait tile, the hit area of a bespoke selection grid */}
      <button
        id={picker.tileId(hero.id)}
        type="button"
        data-slot="hero-grid-tile"
        data-state={state}
        data-hero-id={hero.id}
        tabIndex={picker.activeId === hero.id ? 0 : -1}
        aria-label={`${hero.name}${STATE_WORD[state]}`}
        aria-pressed={pressable ? state === "selected" : undefined}
        aria-disabled={disabled || undefined}
        aria-describedby={[hasMeta && metaId, reason && reasonId].filter(Boolean).join(" ") || undefined}
        title={title ?? hero.name}
        className={cn(tileVariants({ state, size }), className)}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) picker.pick(hero.id);
        }}
        onFocus={(event) => {
          onFocus?.(event);
          picker.setActiveId(hero.id);
        }}
        {...props}
      >
        <HeroImage
          heroId={hero.id}
          title=""
          aria-hidden
          emphasis={state === "excluded" ? "dim" : "normal"}
          className={cn("shrink-0 object-contain", size === "sm" ? "size-6 @3xs:size-8" : "size-7 @3xs:size-9")}
        />
        <span className="w-full truncate text-center text-3xs leading-tight text-muted-foreground">{hero.name}</span>
        {hasMeta && (
          <span
            id={metaId}
            data-slot="hero-grid-tile-meta"
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
          <span aria-hidden="true" data-slot="hero-grid-tile-mark" className={markVariants({ state: state as never })}>
            <Mark strokeWidth={3} />
          </span>
        )}
      </button>
    </div>
  );
}

/**
 * The search box above a `HeroGrid`: it narrows `picker.matches`, Enter picks the first match and ArrowDown moves into
 * the grid. Props reach `SearchInput`.
 */
export function HeroGridSearch({
  picker,
  size = "sm",
  placeholder = "Search heroes…",
  onKeyDown,
  ...props
}: Omit<React.ComponentProps<typeof SearchInput>, "value" | "defaultValue" | "onValueChange"> & {
  picker: HeroPicker;
}) {
  return (
    <SearchInput
      id={picker.searchId}
      size={size}
      aria-label="Search heroes"
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
