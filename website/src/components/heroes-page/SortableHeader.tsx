import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { TableHead } from "~/components/ui/table";
import { cn } from "~/lib/utils";

export type SortKey = "hero" | "winrate" | "zScore" | "residual" | "pickRate" | "banRate";
export type SortDir = "asc" | "desc";

export function SortableHeader<Key extends string>({
  label,
  sortKey,
  activeSortKey,
  sortDir,
  onSort,
  children,
  className,
}: {
  label: string;
  sortKey: Key;
  activeSortKey: Key;
  sortDir: SortDir;
  onSort: (key: Key) => void;
  children?: React.ReactNode;
  className?: string;
}) {
  const isActive = activeSortKey === sortKey;
  return (
    <TableHead
      scope="col"
      className={cn("text-center", className)}
      aria-sort={isActive ? (sortDir === "desc" ? "descending" : "ascending") : undefined}
    >
      <button
        type="button"
        className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => onSort(sortKey)}
      >
        <span>{label}</span>
        {children}
        {isActive ? (
          sortDir === "desc" ? (
            <ArrowDown aria-hidden="true" className="size-3.5" />
          ) : (
            <ArrowUp aria-hidden="true" className="size-3.5" />
          )
        ) : (
          <ArrowUpDown aria-hidden="true" className="size-3.5 text-muted-foreground/50" />
        )}
      </button>
    </TableHead>
  );
}
