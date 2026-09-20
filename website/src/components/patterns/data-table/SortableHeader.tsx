import { ariaSort, SortButton, type SortDir } from "~/components/ui/sort-button";
import { TableHead } from "~/components/ui/table";
import { cn } from "~/lib/utils";

const cellAlignClass = { start: "text-start", center: "text-center", end: "text-end" };

/** A sortable column of a `Table`. Where the header cell is not a `TableHead`, use `SortButton` and `ariaSort()`. */
export function SortableHeader<Key extends string>({
  label,
  sortKey,
  activeSortKey,
  sortDir,
  onSort,
  align = "center",
  size = "default",
  sortLabel,
  children,
  className,
  ...props
}: Omit<React.ComponentProps<typeof TableHead>, "children" | "align"> & {
  label: React.ReactNode;
  sortKey: Key;
  activeSortKey: Key;
  sortDir: SortDir;
  onSort: (key: Key) => void;
  align?: "start" | "center" | "end";
  size?: React.ComponentProps<typeof SortButton>["size"];
  /** Accessible name of the button where the visible label is not enough, such as "Sort by win rate, descending". */
  sortLabel?: string;
  /** Extra content inside the button, after the label: an info icon, a unit. */
  children?: React.ReactNode;
}) {
  const isActive = activeSortKey === sortKey;
  return (
    <TableHead
      scope="col"
      className={cn(cellAlignClass[align], className)}
      aria-sort={ariaSort(isActive, sortDir)}
      {...props}
    >
      <SortButton
        active={isActive}
        sortDir={sortDir}
        align={align}
        size={size}
        aria-label={sortLabel}
        onClick={() => onSort(sortKey)}
      >
        <span>{label}</span>
        {children}
      </SortButton>
    </TableHead>
  );
}
