import { ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";
import { useCallback } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { SearchInput } from "~/components/ui/search-input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { cn } from "~/lib/utils";

export interface PaginationControlsProps extends Omit<React.ComponentProps<"div">, "children"> {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  itemsPerPage: number;
  onItemsPerPageChange: (items: number) => void;
  currentPage: number;
  onPageChange: (page: number) => void;
  totalPages: number;
  searchPlaceholder?: string;
  children?: React.ReactNode;
  /** `sm` is one tight row with icon buttons, for a table inside a panel. */
  size?: "sm" | "default";
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
  size = "default",
  className,
  ...props
}: PaginationControlsProps) {
  const compact = size === "sm";
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
      data-slot="pagination-controls"
      data-size={compact ? "sm" : "default"}
      className={cn(
        "@container flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3",
        compact && "gap-x-2 gap-y-1 py-1",
        className,
      )}
      {...props}
    >
      {onSearchChange && (
        // The search takes the rest of the row it wraps onto, rather than leaving a phone-wide gap beside it.
        <div className="flex flex-1 basis-full items-center gap-2 @lg:flex-none @lg:basis-auto">
          <SearchInput
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder.replace(/[.…]+$/, "")}
            value={searchQuery ?? ""}
            onValueChange={onSearchChange}
            size="sm"
            className="w-full @lg:w-48"
          />
        </div>
      )}
      {children}
      <div className={cn("flex items-center gap-2", compact && "gap-1")}>
        <span className={cn("text-sm text-muted-foreground", compact && "text-xs")}>
          {compact ? "Rows" : "Rows per page"}
        </span>
        <Select value={String(itemsPerPage)} onValueChange={handleItemsPerPageChange}>
          <SelectTrigger size="sm" className={compact ? "w-16 gap-1 px-2" : "w-20"} aria-label="Rows per page">
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
      <span className={cn("flex items-center text-sm text-muted-foreground", compact ? "gap-1 text-xs" : "gap-3")}>
        {!compact && "Page"}
        <span>
          <Input
            type="number"
            aria-label="Page number"
            max={totalPages}
            min={1}
            value={currentPage + 1}
            onChange={handlePageInputChange}
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
