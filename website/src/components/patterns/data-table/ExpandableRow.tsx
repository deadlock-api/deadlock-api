import { ChevronRightIcon } from "lucide-react";
import { createContext, useContext, useMemo } from "react";

import { Button } from "~/components/ui/button";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { TableCell, TableRow } from "~/components/ui/table";
import { cn } from "~/lib/utils";

const ExpandableRowContext = createContext<{ open: boolean; toggle: () => void } | null>(null);

/**
 * A table row that opens a full-width detail row under it. The whole row toggles on click, except for the links
 * and buttons inside it; put an `ExpandableRowToggle` in the first cell so the keyboard can reach it too.
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
  ...props
}: React.ComponentProps<typeof TableRow> & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The number of columns the detail row spans: all of them. */
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
  return (
    <ExpandableRowContext.Provider value={context}>
      <TableRow
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
          <TableCell colSpan={colSpan} className="px-6 py-3 whitespace-normal">
            {details}
          </TableCell>
        </TableRow>
      )}
    </ExpandableRowContext.Provider>
  );
}

/** The chevron button of an `ExpandableRow`. `label` names what it expands: the row's title. */
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
      aria-label={`${row.open ? "Collapse" : "Expand"} ${label}`}
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
