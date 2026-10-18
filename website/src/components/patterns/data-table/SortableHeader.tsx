import { InfoTip } from "~/components/ui/info-tip";
import { ariaSort, SortButton, type SortDir } from "~/components/ui/sort-button";
import { TableHead } from "~/components/ui/table";
import { cn } from "~/lib/utils";

const cellAlignClass = { start: "text-start", center: "text-center", end: "text-end" };

/**
 * A sortable column of a `Table`. Where the header cell is not a `TableHead`, use `SortButton` and `ariaSort()`.
 * The button is named by its visible label alone (WCAG 2.5.3, label in name) and the cell's `aria-sort` gives the
 * state, so there is no separate accessible name to drift from what the reader sees.
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
  /**
   * What the column means, shown on hover and focus of an info button after the sort button ("About <label>"). Not
   * an icon in `children`: that is inside the sort button, where neither the keyboard nor a screen reader finds it.
   */
  description?: React.ReactNode;
  /** Extra content inside the button, after the label: a unit. */
  children?: React.ReactNode;
}) {
  const isActive = activeSortKey === sortKey;
  const sortButton = (
    <SortButton active={isActive} sortDir={sortDir} align={align} size={size} onClick={() => onSortChange(sortKey)}>
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
        <span data-slot="sortable-header-described" className="inline-flex items-center gap-1">
          {sortButton}
          <InfoTip label={typeof label === "string" ? `About ${label}` : "About this column"} content={description} />
        </span>
      )}
    </TableHead>
  );
}
