import { ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";
import { useCallback } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { cn } from "~/lib/utils";

export interface PaginationControlsProps {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  itemsPerPage: number;
  onItemsPerPageChange: (items: number) => void;
  currentPage: number;
  onPageChange: (page: number) => void;
  totalPages: number;
  searchPlaceholder?: string;
  children?: React.ReactNode;
  compact?: boolean;
}

export function PaginationControls({
  searchQuery,
  onSearchChange,
  itemsPerPage,
  onItemsPerPageChange,
  currentPage,
  onPageChange,
  totalPages,
  searchPlaceholder = "Search...",
  children,
  compact = false,
}: PaginationControlsProps) {
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSearchChange?.(e.target.value);
    },
    [onSearchChange],
  );

  const handleItemsPerPageChange = useCallback(
    (value: string) => {
      onItemsPerPageChange(Number(value));
    },
    [onItemsPerPageChange],
  );

  const handlePageInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const page = parseInt(e.target.value, 10);
      if (!Number.isNaN(page) && page > 0 && page <= totalPages) {
        onPageChange(page - 1);
      }
    },
    [onPageChange, totalPages],
  );

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3",
        compact && "gap-x-2 gap-y-1 py-1",
      )}
    >
      {onSearchChange && (
        // The search takes the rest of the row it wraps onto, rather than leaving a phone-wide gap beside it.
        <div className="flex flex-1 items-center gap-2 sm:flex-none">
          <Input
            type="search"
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder.replace(/[.…]+$/, "")}
            value={searchQuery}
            onChange={handleSearchChange}
            className="h-8 w-full sm:w-40"
          />
        </div>
      )}
      {children}
      <div className={cn("flex items-center gap-2", compact && "gap-1")}>
        <span className={cn("text-sm text-muted-foreground", compact && "text-xs")}>
          {compact ? "Rows" : "Rows per page"}
        </span>
        <Select value={String(itemsPerPage)} onValueChange={handleItemsPerPageChange}>
          <SelectTrigger className={cn("h-8 w-20", compact && "w-16 gap-1 px-2 text-xs")} aria-label="Rows per page">
            <SelectValue placeholder={itemsPerPage} />
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
      <span className={cn("flex items-center gap-1 text-sm text-muted-foreground", compact && "text-xs")}>
        {!compact && "Page"}
        <span className={cn(!compact && "mx-2")}>
          <Input
            type="number"
            aria-label="Page number"
            max={totalPages}
            min={1}
            value={currentPage + 1}
            onChange={handlePageInputChange}
            className={cn("h-8 w-16 text-center", compact && "w-12 px-1 text-xs")}
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
          onClick={() => onPageChange(Math.max(0, currentPage - 1))}
          disabled={currentPage === 0}
        >
          {compact ? <ChevronLeft aria-hidden="true" /> : "Previous"}
        </Button>
        <Button
          variant="outline"
          size={compact ? "icon-sm" : "sm"}
          aria-label="Next page"
          title={compact ? "Next page" : undefined}
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages - 1}
        >
          {compact ? <ChevronRight aria-hidden="true" /> : "Next"}
        </Button>
      </div>
    </div>
  );
}
