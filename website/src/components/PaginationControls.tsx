import type React from "react";
import { useCallback } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";

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
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      {onSearchChange && (
        // The search takes the rest of the row it wraps onto, rather than leaving a phone-wide gap beside it.
        <div className="flex flex-1 items-center space-x-2 sm:flex-none">
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
      <div className="flex items-center space-x-2">
        <span className="text-sm text-muted-foreground">Rows per page</span>
        <Select value={String(itemsPerPage)} onValueChange={handleItemsPerPageChange}>
          <SelectTrigger className="h-8 w-20" aria-label="Rows per page">
            <SelectValue placeholder={itemsPerPage} />
          </SelectTrigger>
          <SelectContent>
            {[10, 25, 50, 100].map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <span className="flex items-center space-x-1 text-sm text-muted-foreground">
        Page
        <span className="mx-2">
          <Input
            type="number"
            aria-label="Page number"
            max={totalPages}
            min={1}
            value={currentPage + 1}
            onChange={handlePageInputChange}
            className="h-8 w-16 text-center"
          />
        </span>
        of {Math.max(1, totalPages)}
      </span>
      <div className="flex items-center space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(0, currentPage - 1))}
          disabled={currentPage === 0}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages - 1}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
