import { ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";
import { useCallback, useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { cn } from "~/lib/utils";

interface PaginationControlsProps extends React.ComponentProps<"div"> {
  /** Zero-based. */
  page: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange: (pageSize: number) => void;
  totalPages: number;
  /** `sm` is one tight row with icon buttons, for a table inside a panel. */
  size?: "sm" | "default";
}

/**
 * Rows per page and paging in one wrapping row. Children are the table's other controls and come first; a
 * `SearchInput` among them takes the whole row it wraps onto in a narrow container.
 */
export function PaginationControls({
  page,
  onPageChange,
  pageSize,
  onPageSizeChange,
  totalPages,
  children,
  size = "default",
  className,
  ...props
}: PaginationControlsProps) {
  const compact = size === "sm";
  const handlePageSizeChange = useCallback(
    (value: string) => {
      onPageSizeChange(Number(value));
    },
    [onPageSizeChange],
  );

  // What is typed, while it is typed: an empty field or a number on its way to a valid one ("2" on the way to "25"
  // of 30 pages) must not snap back to the current page under the cursor. The draft belongs to the page it left the
  // table on, so a page change from elsewhere (a filter reset, the back button) shows the new page instead.
  const [draft, setDraft] = useState<{ text: string; page: number } | null>(null);
  const handlePageInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const pageNumber = parseInt(e.target.value, 10);
      const valid = !Number.isNaN(pageNumber) && pageNumber > 0 && pageNumber <= totalPages;
      setDraft({ text: e.target.value, page: valid ? pageNumber - 1 : page });
      if (valid) onPageChange(pageNumber - 1);
    },
    [onPageChange, totalPages, page],
  );

  return (
    <div
      data-slot="pagination-controls"
      data-size={compact ? "sm" : "default"}
      className={cn(
        "@container flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3",
        // A search takes the rest of the row it wraps onto, rather than leaving a phone-wide gap beside it.
        "[&>:where([data-slot=search-input])]:flex-1 [&>:where([data-slot=search-input])]:basis-full @lg:[&>:where([data-slot=search-input])]:w-48 @lg:[&>:where([data-slot=search-input])]:flex-none @lg:[&>:where([data-slot=search-input])]:basis-auto",
        compact && "gap-x-2 gap-y-1 py-1",
        className,
      )}
      {...props}
    >
      {children}
      <div className={cn("flex items-center gap-2", compact && "gap-1")}>
        <span className={cn("text-sm text-muted-foreground", compact && "text-xs")}>
          {compact ? "Rows" : "Rows per page"}
        </span>
        <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
          <SelectTrigger size="sm" className={compact ? "w-16 gap-1 px-2" : "w-20"} aria-label="Rows per page">
            <SelectValue placeholder={pageSize} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {[10, 25, 50, 100].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <span className={cn("flex items-center text-sm text-muted-foreground", compact ? "gap-1 text-xs" : "gap-3")}>
        {!compact && "Page"}
        <span>
          <Input
            type="number"
            aria-label="Page number"
            max={totalPages}
            min={1}
            value={draft?.page === page ? draft.text : page + 1}
            onChange={handlePageInputChange}
            onBlur={() => setDraft(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setDraft(null);
            }}
            size="sm"
            className={cn("text-center", compact ? "w-12 px-1" : "w-16")}
          />
        </span>
        of {Math.max(1, totalPages)}
      </span>
      <div className={cn("flex items-center gap-2", compact && "gap-1")}>
        <Button
          variant="outline"
          size={compact ? "icon-sm" : "sm"}
          aria-label="Previous page"
          title={compact ? "Previous page" : undefined}
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
        >
          {compact ? <ChevronLeft aria-hidden="true" /> : "Previous"}
        </Button>
        <Button
          variant="outline"
          size={compact ? "icon-sm" : "sm"}
          aria-label="Next page"
          title={compact ? "Next page" : undefined}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
        >
          {compact ? <ChevronRight aria-hidden="true" /> : "Next"}
        </Button>
      </div>
    </div>
  );
}
