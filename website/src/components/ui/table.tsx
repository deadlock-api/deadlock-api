import * as React from "react";

import { SCROLLBAR_THIN } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

type TableDensity = "default" | "compact" | "dense";

// Each cell resolves the density from this context into plain classes. A `group-data-[density=…]/table:` variant
// would outrank the one class a caller passes to a cell.
const TableDensityContext = React.createContext<TableDensity>("default");

const HEAD_DENSITY: Record<TableDensity, string> = { default: "h-10 px-2", compact: "h-9 px-2", dense: "h-7 px-1.5" };
// A `compact` row is 36px whatever it holds: tall enough for a 24px control (`Button size="icon-xs"`) with its
// padding and rule, so a row with inline buttons and a row of plain text, or a table with and without such a column,
// keep one height. On a cell, `height` is the row's floor; taller content still grows it.
const CELL_DENSITY: Record<TableDensity, string> = {
  default: "p-2",
  compact: "h-9 px-2 py-1",
  dense: "px-1.5 py-1",
};
// A sticky head or foot row covers the edge of the scroll box. Scroll padding of the row's height keeps a row that
// is scrolled into view (focus, `scrollIntoView`) clear of it (WCAG 2.4.11, focus not obscured).
const STICKY_SCROLL_PADDING: Record<TableDensity, string> = {
  default:
    "has-[>table>thead[data-position=sticky]]:scroll-pt-10 has-[>table>tfoot[data-position=sticky]]:scroll-pb-10",
  compact: "has-[>table>thead[data-position=sticky]]:scroll-pt-9 has-[>table>tfoot[data-position=sticky]]:scroll-pb-9",
  dense: "has-[>table>thead[data-position=sticky]]:scroll-pt-7 has-[>table>tfoot[data-position=sticky]]:scroll-pb-7",
};

/**
 * `density` sets the row height of every cell at once: `default` for short lists, `compact` (36px rows, which fit a
 * 24px inline control) for data tables, `dense` for tables inside panels and dialogs.
 *
 * A table wider than its container scrolls sideways inside it, and the edge with more columns past it fades out
 * (`scroll-fade-x`; with a pinned column only the end edge). A table with a pinned column is also the `table`
 * container, so its pinned cell can give up width in a narrow one (`@md/table:min-w-40`, `hidden @md/table:block`).
 *
 * `width`: `fill` (default) spreads the columns over the container; `hug` sizes them to their content, for a table
 * of a few columns whose values would otherwise sit far from their labels. A hugging table is never the `table`
 * container, since a size container has no width of its own to hug with.
 */
function Table({
  className,
  density = "default",
  width = "fill",
  height = "auto",
  ...props
}: React.ComponentProps<"table"> & {
  density?: TableDensity;
  width?: "fill" | "hug";
  /**
   * `fill` grows the table to the height of a flex-column parent (a stretched panel), its rows sharing the extra.
   * `scroll` takes the room left in a flex-column parent of fixed height (a panel in a `PanelRow`) and scrolls inside
   * it; the rows keep their height, and a short list leaves the room below it empty.
   */
  height?: "auto" | "fill" | "scroll";
}) {
  return (
    <TableDensityContext value={density}>
      <div
        data-slot="table-container"
        // A size container has no width of its own, so a hugging table cannot be one: its pinned column stays sticky
        // but the `@md/table:` variants do not apply.
        className={cn(
          SCROLLBAR_THIN,
          "relative w-full scroll-fade-x overflow-x-auto",
          STICKY_SCROLL_PADDING[density],
          width === "fill" && "has-data-pinned:@container/table",
          height === "fill" && "flex-1",
          height === "scroll" && "min-h-0 flex-1",
        )}
      >
        <table
          data-slot="table"
          data-density={density}
          data-width={width}
          className={cn(
            "group/table caption-bottom",
            width === "fill" ? "w-full" : "w-max",
            height === "fill" && "h-full",
            density === "dense" ? "text-xs" : "text-sm",
            className,
          )}
          {...props}
        />
      </div>
    </TableDensityContext>
  );
}

type TableHeaderTone = "none" | "muted" | "card";

// The fill sits on the cells, not on the `<thead>`: a sticky cell carries its own background, and a background on
// the section is painted behind the scrolling rows instead of with the header.
const HEADER_TONE: Record<TableHeaderTone, string> = {
  none: "",
  muted: "[&_th]:bg-muted",
  card: "[&_th]:bg-card",
};

// Set by TableHeader: a TableHead inside it heads a column (`scope="col"`) without the caller saying so.
const TableHeaderContext = React.createContext(false);

function TableHeader({
  tone,
  position = "static",
  className,
  ...props
}: React.ComponentProps<"thead"> & {
  /** The fill behind the head row. A `sticky` header defaults to `card`: rows must not show through it. */
  tone?: TableHeaderTone;
  /** `sticky` keeps the head row at the top of the table's own scroll container. */
  position?: "static" | "sticky";
}) {
  const resolvedTone = tone ?? (position === "sticky" ? "card" : "none");
  return (
    <TableHeaderContext value={true}>
      <thead
        data-slot="table-header"
        data-tone={resolvedTone}
        data-position={position}
        className={cn(
          // A head row never answers to the pointer, so it keeps its rule without `data-plain`, which also drops it.
          "[&_tr]:border-b [&_tr:hover]:bg-transparent",
          HEADER_TONE[resolvedTone],
          position === "sticky" && "[&_th]:sticky [&_th]:top-0 [&_th]:z-10",
          className,
        )}
        {...props}
      />
    </TableHeaderContext>
  );
}

/**
 * A row group. Several rows that are one record share their states through the group, so hovering or selecting any
 * of them lights all of them: set `data-interactive` for the hover fill and `data-state` for the standing one
 * (`current` is also `aria-current`, with a brand rule down the leading edge).
 * `viewed` is the quiet brand tint of a record the reader has already opened.
 */
function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  const current = (props as { "data-state"?: string })["data-state"] === "current";
  return (
    <tbody
      data-slot="table-body"
      aria-current={current ? "true" : undefined}
      className={cn(
        "[&_tr:last-child]:border-0",
        "[&[data-interactive]_tr]:cursor-pointer [&[data-interactive]:hover_tr]:bg-muted/50",
        "[&[data-state=current]_tr]:bg-accent [&[data-state=current]_tr]:font-medium [&[data-state=current]_tr>:first-child]:shadow-current-start",
        "[&[data-state=selected]_tr]:bg-muted",
        "[&[data-state=viewed]_tr]:bg-primary/10",
        className,
      )}
      {...props}
    />
  );
}

const FOOTER_TONE = {
  default: "border-t font-medium [&_tr]:bg-transparent",
  /** The result the table leads to (a tally, a winner): ruled off in the brand color and tinted, pinned cell too. */
  highlight: "border-t-2 border-primary font-semibold [&_td]:bg-table-total [&_td[data-pinned]]:bg-table-total",
} as const;

/**
 * The result rows under the body: totals, a tally. Ruled off from the body and set heavier; its rows carry no stripe
 * and never answer to the pointer. `tone="highlight"` makes it the table's result.
 */
function TableFooter({
  tone = "default",
  position = "static",
  className,
  ...props
}: React.ComponentProps<"tfoot"> & {
  tone?: keyof typeof FOOTER_TONE;
  /**
   * `sticky` keeps the footer rows at the bottom of the table's own scroll container, on an opaque fill with their
   * rule drawn on the cells, so the totals stay beside the rows they sum.
   */
  position?: "static" | "sticky";
}) {
  return (
    <tfoot
      data-slot="table-footer"
      data-tone={tone}
      data-position={position}
      className={cn(
        "[&_tr]:border-0 [&_tr:hover]:bg-transparent",
        FOOTER_TONE[tone],
        position === "sticky" && "[&_td]:sticky [&_td]:bottom-0 [&_td]:z-10 [&_td]:shadow-rule-top",
        position === "sticky" && tone === "default" && "[&_td]:bg-card",
        className,
      )}
      {...props}
    />
  );
}

/** `section`: the heading row of a group of rows, filled across its whole width like its pinned header cell. */
const ROW_TONE = { default: "", section: "bg-muted even:bg-muted hover:bg-muted" } as const;

/**
 * A row's standing state is `data-state`: `current` (the row the page is about: you, the rank jumped to) is also
 * `aria-current` and carries a brand rule down its leading edge, so it is marked by more than its fill.
 */
function TableRow({
  tone = "default",
  className,
  ...props
}: React.ComponentProps<"tr"> & { tone?: keyof typeof ROW_TONE }) {
  const current = (props as { "data-state"?: string })["data-state"] === "current";
  return (
    <tr
      data-slot="table-row"
      data-tone={tone}
      aria-current={current ? "true" : undefined}
      className={cn(
        // `data-plain` drops the rule and the hover fill; `data-static` drops the hover fill and keeps the rule.
        // Even rows carry a faint translucent stripe, the same on a card or on glass; hover and the states come later
        // in the cascade and paint over it. A pinned cell draws the opaque twin of it (`table-stripe`).
        "border-b transition-colors even:bg-subtle hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-interactive:cursor-pointer data-plain:border-0 data-plain:hover:bg-transparent data-static:hover:bg-transparent data-[state=current]:bg-accent data-[state=current]:font-medium data-[state=selected]:bg-muted",
        "data-[state=current]:[&>:first-child]:shadow-current-start",
        // `active`: the row whose details are open beside the table, in a faint brand tint.
        "data-[state=active]:bg-primary/10 data-[state=active]:hover:bg-primary/15",
        ROW_TONE[tone],
        // A row stepped through with `useListNavigation` shows the focus of its control as an outline round the row.
        "has-[[data-list-index]:focus-visible]:outline-2 has-[[data-list-index]:focus-visible]:-outline-offset-2 has-[[data-list-index]:focus-visible]:outline-ring [&_[data-list-index]:focus-visible]:ring-0",
        className,
      )}
      {...props}
    />
  );
}

/** `muted`: a quiet column or row name, beside the values it names. */
const HEAD_TONE = { default: "text-foreground", muted: "text-muted-foreground" } as const;

/**
 * A column's width, set on its head so it holds whatever the body shows (an empty or filtered body re-spread columns
 * sized by their body cells): `auto` shares out as the browser likes, `fill` takes the room the others leave (the
 * column of the row's name; its body cells add `max-w-0` to truncate), `hug` is as narrow as its widest content (a
 * column of controls).
 */
const HEAD_WIDTH = { auto: "", fill: "w-full", hug: "w-px" } as const;

function TableHead({
  tone = "default",
  width = "auto",
  className,
  ...props
}: React.ComponentProps<"th"> & { tone?: keyof typeof HEAD_TONE; width?: keyof typeof HEAD_WIDTH }) {
  const density = React.use(TableDensityContext);
  const inHeader = React.use(TableHeaderContext);
  return (
    <th
      data-slot="table-head"
      // In the head row it names its column for every cell under it; `scope` passed in still wins.
      scope={inHeader ? "col" : undefined}
      data-tone={tone}
      data-width={width}
      className={cn(
        "text-start align-middle font-medium whitespace-nowrap data-pinned:sticky data-pinned:inset-s-0 data-pinned:z-10 data-pinned:bg-muted [&:has([role=checkbox])]:pe-0 [&>[role=checkbox]]:translate-y-0.5",
        HEAD_TONE[tone],
        HEAD_WIDTH[width],
        HEAD_DENSITY[density],
        className,
      )}
      {...props}
    />
  );
}

/**
 * The cell that names its row (`<th scope="row">`): a stat's label, a build's name. Screen readers read it with every
 * value of the row. Set like a body cell, at the body's density and weight; `tone="muted"` for a label beside values.
 */
function TableRowHeader({
  tone = "default",
  className,
  ...props
}: React.ComponentProps<"th"> & { tone?: keyof typeof HEAD_TONE }) {
  const density = React.use(TableDensityContext);
  return (
    <th
      data-slot="table-row-header"
      data-tone={tone}
      scope="row"
      className={cn(
        "text-start align-middle font-normal whitespace-nowrap data-pinned:sticky data-pinned:inset-s-0 data-pinned:z-10 data-pinned:bg-card [tr:nth-child(even)>&]:data-pinned:bg-table-stripe",
        HEAD_TONE[tone],
        CELL_DENSITY[density],
        className,
      )}
      {...props}
    />
  );
}

/** A cell's own verdict, tinted faintly behind its value: a won or lost match, a gain or a loss. */
const CELL_TONE = { default: "", positive: "bg-positive/10", negative: "bg-negative/10" } as const;

function TableCell({
  tone = "default",
  className,
  ...props
}: React.ComponentProps<"td"> & { tone?: keyof typeof CELL_TONE }) {
  const density = React.use(TableDensityContext);
  return (
    <td
      data-slot="table-cell"
      data-tone={tone}
      className={cn(
        "align-middle whitespace-nowrap data-pinned:sticky data-pinned:inset-s-0 data-pinned:z-10 data-pinned:bg-card [&:has([role=checkbox])]:pe-0 [&>[role=checkbox]]:translate-y-0.5 [tr:nth-child(even)>&]:data-pinned:bg-table-stripe",
        CELL_DENSITY[density],
        CELL_TONE[tone],
        className,
      )}
      {...props}
    />
  );
}

/**
 * Names the table. `visibility="sr-only"` names it for assistive technology only, where the heading and filters above
 * already say what it is to the eye: "Europe leaderboard".
 */
function TableCaption({
  visibility = "visible",
  className,
  ...props
}: React.ComponentProps<"caption"> & { visibility?: "visible" | "sr-only" }) {
  return (
    <caption
      data-slot="table-caption"
      data-visibility={visibility}
      className={cn(visibility === "sr-only" ? "sr-only" : "pt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableRowHeader, TableCell, TableCaption };
