import * as React from "react";

import { cn } from "~/lib/utils";

type TableDensity = "default" | "compact" | "dense";

// Each cell resolves the density from this context into plain classes. A `group-data-[density=…]/table:` variant
// would outrank the one class a caller passes to a cell.
const TableDensityContext = React.createContext<TableDensity>("default");

const HEAD_DENSITY: Record<TableDensity, string> = { default: "h-10 px-2", compact: "h-9 px-2", dense: "h-7 px-1.5" };
const CELL_DENSITY: Record<TableDensity, string> = { default: "p-2", compact: "px-2 py-1.5", dense: "px-1.5 py-1" };

/**
 * `density` sets the row height of every cell at once: `default` for short lists, `compact` (about 40px rows) for
 * data tables, `dense` for tables inside panels and dialogs.
 */
function Table({
  className,
  density = "default",
  ...props
}: React.ComponentProps<"table"> & { density?: TableDensity }) {
  return (
    <TableDensityContext value={density}>
      <div data-slot="table-container" className="relative w-full scrollbar-thin overflow-x-auto">
        <table
          data-slot="table"
          data-density={density}
          className={cn("group/table w-full caption-bottom", density === "dense" ? "text-xs" : "text-sm", className)}
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
  );
}

/**
 * A row group. Several rows that are one record share their states through the group, so hovering or selecting any
 * of them lights all of them: set `data-interactive` for the hover fill and `data-state` for the standing one.
 * `viewed` is the quiet brand tint of a record the reader has already opened.
 */
function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn(
        "[&_tr:last-child]:border-0",
        "[&[data-interactive]_tr]:cursor-pointer [&[data-interactive]:hover_tr]:bg-muted/50",
        "[&[data-state=current]_tr]:bg-accent [&[data-state=current]_tr]:font-medium",
        "[&[data-state=selected]_tr]:bg-muted",
        "[&[data-state=viewed]_tr]:bg-primary/10",
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        // `data-plain` drops the rule and the hover fill; `data-static` drops the hover fill and keeps the rule.
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-interactive:cursor-pointer data-plain:border-0 data-plain:hover:bg-transparent data-static:hover:bg-transparent data-[state=current]:bg-accent data-[state=current]:font-medium data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  const density = React.use(TableDensityContext);
  return (
    <th
      data-slot="table-head"
      className={cn(
        "text-start align-middle font-medium whitespace-nowrap text-foreground data-pinned:sticky data-pinned:start-0 data-pinned:z-10 data-pinned:bg-muted [&:has([role=checkbox])]:pe-0 [&>[role=checkbox]]:translate-y-0.5",
        HEAD_DENSITY[density],
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  const density = React.use(TableDensityContext);
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "align-middle whitespace-nowrap data-pinned:sticky data-pinned:start-0 data-pinned:z-10 data-pinned:bg-card [&:has([role=checkbox])]:pe-0 [&>[role=checkbox]]:translate-y-0.5",
        CELL_DENSITY[density],
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption data-slot="table-caption" className={cn("pt-4 text-sm text-muted-foreground", className)} {...props} />
  );
}

export { Table, TableHeader, TableBody, TableHead, TableRow, TableCell, TableCaption };
