import { ChevronRightIcon } from "lucide-react";
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { assignRef } from "~/components/ui/hooks/assign-ref";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { TableCell, TableRow } from "~/components/ui/table";
import { cn } from "~/lib/utils";

const ExpandableRowContext = createContext<{ open: boolean; toggle: () => void } | null>(null);

/** The columns a row's cells take up, leaving out cells a breakpoint hides (`hidden @xl:table-cell`). */
function shownColumns(row: HTMLTableRowElement) {
  let columns = 0;
  for (const cell of row.cells) if (getComputedStyle(cell).display !== "none") columns += cell.colSpan;
  return columns;
}

/**
 * A table row that opens a full-width detail row under it. The whole row toggles on click, except for the links
 * and buttons inside it; put an `ExpandableRowToggle` in the first cell so the keyboard can reach it too.
 *
 * The detail row spans the columns the row shows: a column a breakpoint hides is left out, since a span over it would
 * add an empty column to a fixed-layout table and take its width from the others.
 */
export function ExpandableRow({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  colSpan,
  details,
  className,
  children,
  onClick,
  ref,
  ...props
}: React.ComponentProps<typeof TableRow> & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The number of columns of the table: the detail row spans those of them the row shows. */
  colSpan: number;
  /** Rendered only while the row is open, so it may fetch. */
  details: React.ReactNode;
}) {
  const [open, setOpen] = useControllableState({
    value: controlledOpen,
    defaultValue: defaultOpen,
    onValueChange: onOpenChange,
  });
  const context = useMemo(() => ({ open, toggle: () => setOpen(!open) }), [open, setOpen]);
  const rowRef = useRef<HTMLTableRowElement | null>(null);
  const [span, setSpan] = useState(colSpan);
  // Measured before paint, and again when the row resizes (a breakpoint showing or hiding a column changes its width).
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!open || !row) return;
    const update = () => setSpan(Math.max(1, Math.min(colSpan, shownColumns(row))));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(row);
    return () => observer.disconnect();
  }, [open, colSpan]);
  return (
    <ExpandableRowContext.Provider value={context}>
      <TableRow
        ref={(node) => {
          rowRef.current = node;
          return assignRef(ref, node);
        }}
        data-expandable
        data-interactive
        data-state={open ? "open" : "closed"}
        className={className}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented || (event.target as HTMLElement).closest("a, button, input, select, label"))
            return;
          context.toggle();
        }}
        {...props}
      >
        {children}
      </TableRow>
      {open && (
        <TableRow data-expandable-details className="bg-background/50 hover:bg-background/50">
          <TableCell colSpan={span} className="px-6 py-3 whitespace-normal">
            {details}
          </TableCell>
        </TableRow>
      )}
    </ExpandableRowContext.Provider>
  );
}

/** The chevron button of an `ExpandableRow`. `label` names what it expands (the row's title); `aria-expanded` its state. */
export function ExpandableRowToggle({
  label,
  className,
  onClick,
  ...props
}: React.ComponentProps<"button"> & { label: string }) {
  const row = useContext(ExpandableRowContext);
  if (!row) throw new Error("ExpandableRowToggle must be inside an ExpandableRow");
  return (
    <Button
      data-slot="expandable-row-toggle"
      variant="ghost"
      size="icon-xs"
      aria-expanded={row.open}
      // The name stays the row's; `aria-expanded` alone says whether it is open, so the state is not read twice.
      aria-label={label}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        row.toggle();
      }}
      className={cn("text-muted-foreground", className)}
      {...props}
    >
      <ChevronRightIcon
        className={cn("transition-transform duration-fast ease-standard rtl:-scale-x-100", row.open && "rotate-90")}
      />
    </Button>
  );
}
