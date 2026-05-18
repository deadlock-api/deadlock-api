import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { TableHead } from "~/components/ui/table";
import { cn } from "~/lib/utils";

export type SortKey = "hero" | "winrate" | "zScore" | "residual" | "pickRate" | "banRate";
export type SortDir = "asc" | "desc";

export function SortableHeader({
  label,
  sortKey,
  activeSortKey,
  sortDir,
  onSort,
  children,
  className,
}: {
  label: string;
  sortKey: SortKey;
  activeSortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  children?: React.ReactNode;
  className?: string;
}) {
  const isActive = activeSortKey === sortKey;
  return (
    <TableHead className={cn("text-center", className)}>
      <button
        type="button"
        className="inline-flex cursor-pointer items-center justify-center gap-1 transition-colors hover:text-foreground"
        onClick={() => onSort(sortKey)}
      >
        <span>{label}</span>
        {children}
        {isActive ? (
          sortDir === "desc" ? (
            <ArrowDown className="size-3.5" />
          ) : (
            <ArrowUp className="size-3.5" />
          )
        ) : (
          <ArrowUpDown className="size-3.5 text-muted-foreground/50" />
        )}
      </button>
    </TableHead>
  );
}
