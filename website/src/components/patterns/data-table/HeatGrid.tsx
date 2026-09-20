import { createContext, type KeyboardEvent, use, useId } from "react";

import { HeatCell } from "~/components/ui/heat-cell";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { useGridNavigation } from "~/components/ui/hooks/use-grid-navigation";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

const HeatGridContext = createContext<{
  value: number | null;
  select: (index: number | null) => void;
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  register: (index: number) => (cell: HTMLButtonElement | null) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void;
} | null>(null);

interface HeatGridProps extends Omit<React.ComponentProps<typeof Table>, "density" | "defaultValue" | "onChange"> {
  /** Names the grid: "Matches by weekday and two-hour window". */
  label: string;
  /** Cells per row; a cell's `index` counts row by row. */
  columns: number;
  /** Added to the keyboard instructions read to assistive technology: "Times are local." */
  caption?: React.ReactNode;
  /** The index of the inspected cell. Focus and click pick it; Escape and leaving the grid clear it. */
  value?: number | null;
  defaultValue?: number | null;
  onValueChange?: (index: number | null) => void;
}

/**
 * Readings over two axes as a grid of `HeatCell`s: a real table with row and column headers, one tab stop, arrow-key
 * navigation and an inspected cell. Children are a `HeatGridHead` and `HeatGridRow`s.
 */
export function HeatGrid({
  label,
  columns,
  caption,
  value: valueProp,
  defaultValue = null,
  onValueChange,
  className,
  children,
  onBlur,
  ...props
}: HeatGridProps) {
  const captionId = useId();
  const [value, select] = useControllableState<number | null>({ value: valueProp, defaultValue, onValueChange });
  const navigation = useGridNavigation<HTMLButtonElement>(columns);
  return (
    <HeatGridContext value={{ value, select, ...navigation }}>
      <Table
        data-slot="heat-grid"
        role="grid"
        aria-label={label}
        aria-describedby={captionId}
        className={cn("table-fixed border-separate border-spacing-x-1 border-spacing-y-0.5", className)}
        {...props}
        onBlur={(event) => {
          onBlur?.(event);
          if (!event.currentTarget.contains(event.relatedTarget)) select(null);
        }}
      >
        <TableCaption id={captionId} className="sr-only">
          Tap a cell to inspect it. Use arrow keys to move between cells, Home and End within a row, and Control Home or
          End for the first or last cell. Escape clears the inspected cell. {caption}
        </TableCaption>
        {children}
      </Table>
    </HeatGridContext>
  );
}

/** The column headers. `corner` names the row axis for assistive technology; children are `HeatGridColumn`s. */
export function HeatGridHead({
  corner,
  children,
  ...props
}: React.ComponentProps<typeof TableHeader> & { corner: string }) {
  return (
    <TableHeader data-slot="heat-grid-head" {...props}>
      <TableRow>
        <TableHead className="h-4 w-7 p-0">
          <span className="sr-only">{corner}</span>
        </TableHead>
        {children}
      </TableRow>
    </TableHeader>
  );
}

export function HeatGridColumn({ className, ...props }: React.ComponentProps<typeof TableHead>) {
  return (
    <TableHead
      data-slot="heat-grid-column"
      scope="col"
      className={cn("h-4 p-0 text-center text-4xs", className)}
      {...props}
    />
  );
}

/** One row of `HeatGridCell`s under its header. Rows sit in a `HeatGridBody`. */
export function HeatGridRow({
  label,
  children,
  ...props
}: React.ComponentProps<typeof TableRow> & { label: React.ReactNode }) {
  return (
    <TableRow data-slot="heat-grid-row" {...props}>
      <TableHead scope="row" className="h-4 p-0 text-4xs">
        {label}
      </TableHead>
      {children}
    </TableRow>
  );
}

export function HeatGridBody(props: React.ComponentProps<typeof TableBody>) {
  return <TableBody data-slot="heat-grid-body" {...props} />;
}

interface HeatGridCellProps extends Omit<React.ComponentProps<typeof HeatCell>, "selected" | "tabIndex"> {
  /** The cell's place in the grid, counted row by row from 0. */
  index: number;
  /** The body of the cell's `Tooltip`. */
  tooltip?: React.ReactNode;
}

/** A `HeatCell` in its table cell. `ref` and every other prop reach the button. */
export function HeatGridCell({
  index,
  tooltip,
  className,
  ref,
  onFocus,
  onClick,
  onKeyDown,
  ...props
}: HeatGridCellProps) {
  const grid = use(HeatGridContext);
  if (!grid) throw new Error("HeatGridCell must be used inside a HeatGrid");
  const register = grid.register(index);
  const cell = (
    <HeatCell
      {...props}
      ref={(button) => {
        register(button);
        if (typeof ref === "function") return ref(button);
        if (ref) ref.current = button;
      }}
      tabIndex={grid.activeIndex === index ? 0 : -1}
      selected={grid.value === index}
      onFocus={(event) => {
        onFocus?.(event);
        grid.setActiveIndex(index);
        grid.select(index);
      }}
      onClick={(event) => {
        onClick?.(event);
        grid.select(index);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        // Before the guard: an open Tooltip has already consumed this Escape, and one press should clear both.
        if (event.key === "Escape") grid.select(null);
        else if (!event.defaultPrevented) grid.onKeyDown(event, index);
      }}
      className={cn("block aspect-auto h-6 w-full", className)}
    />
  );
  return (
    <TableCell data-slot="heat-grid-cell" className="p-0">
      {tooltip ? <Tooltip content={tooltip}>{cell}</Tooltip> : cell}
    </TableCell>
  );
}
