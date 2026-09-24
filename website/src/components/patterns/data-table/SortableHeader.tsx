import { Info } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { ariaSort, SortButton, type SortDir } from "~/components/ui/sort-button";
import { TableHead } from "~/components/ui/table";
import { Tooltip } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

const cellAlignClass = { start: "text-start", center: "text-center", end: "text-end" };

/**
 * A sortable column of a `Table`. Where the header cell is not a `TableHead`, use `SortButton` and `ariaSort()`.
 * A `description` explains the column behind an info button beside the sort button, so it is reachable by keyboard.
 */
export function SortableHeader<Key extends string>({
  label,
  sortKey,
  activeSortKey,
  sortDir,
  onSortChange,
  align = "center",
  size = "default",
  sortLabel,
  description,
  children,
  className,
  ...props
}: Omit<React.ComponentProps<typeof TableHead>, "children" | "align"> & {
  label: React.ReactNode;
  sortKey: Key;
  activeSortKey: Key;
  sortDir: SortDir;
  onSortChange: (key: Key) => void;
  align?: "start" | "center" | "end";
  size?: React.ComponentProps<typeof SortButton>["size"];
  /** Accessible name of the button where the visible label is not enough, such as "Sort by win rate, descending". */
  sortLabel?: string;
  /**
   * What the column means, shown on hover and focus of an info button after the sort button ("About <label>"). Not
   * an icon in `children`: that is inside the sort button, where neither the keyboard nor a screen reader finds it.
   */
  description?: React.ReactNode;
  /** Extra content inside the button, after the label: a unit. */
  children?: React.ReactNode;
}) {
  const isActive = activeSortKey === sortKey;
  // A toggletip: hover and focus open it like a tooltip, and a click or tap toggles it, which a plain tooltip
  // swallowed (a press closed it, and a touch never opened it).
  const [infoOpen, setInfoOpen] = useState(false);
  const sortButton = (
    <SortButton
      active={isActive}
      sortDir={sortDir}
      align={align}
      size={size}
      aria-label={sortLabel}
      onClick={() => onSortChange(sortKey)}
    >
      <span>{label}</span>
      {children}
    </SortButton>
  );
  return (
    <TableHead
      scope="col"
      className={cn(cellAlignClass[align], className)}
      aria-sort={ariaSort(isActive, sortDir)}
      {...props}
    >
      {description == null ? (
        sortButton
      ) : (
        <span data-slot="sortable-header-described" className="inline-flex items-center">
          {sortButton}
          <Tooltip content={description} open={infoOpen} onOpenChange={setInfoOpen}>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-expanded={infoOpen}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => setInfoOpen((open) => !open)}
              aria-label={typeof label === "string" ? `About ${label}` : "About this column"}
              className="text-muted-foreground"
            >
              <Info />
            </Button>
          </Tooltip>
        </span>
      )}
    </TableHead>
  );
}
