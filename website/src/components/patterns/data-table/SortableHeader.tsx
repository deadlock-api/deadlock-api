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
  children,
  className,
  ...props
}: Omit<React.ComponentProps<typeof TableHead>, "children" | "align"> & {
  label: string;
  sortKey: Key;
  activeSortKey: Key;
  sortDir: SortDir;
  onSort: (key: Key) => void;
  align?: "start" | "center" | "end";
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
      <SortButton active={isActive} sortDir={sortDir} align={align} onClick={() => onSort(sortKey)}>
        <span>{label}</span>
        {children}
      </SortButton>
    </TableHead>
  );
}
