import React, { useCallback } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";

export interface ScoreboardControlsProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  itemsPerPage: number;
  onItemsPerPageChange: (items: number) => void;
  currentPage: number;
  onPageChange: (page: number) => void;
  hasNextPage: boolean;
}

export function ScoreboardControls({
  searchQuery,
  setSearchQuery,
  itemsPerPage,
  onItemsPerPageChange,
  currentPage,
  onPageChange,
  hasNextPage,
}: ScoreboardControlsProps) {
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    [setSearchQuery],
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
      if (!isNaN(page) && page > 0) {
        onPageChange(page - 1);
      }
    },
    [onPageChange],
  );

  const handlePreviousPage = useCallback(() => onPageChange(Math.max(0, currentPage - 1)), [onPageChange, currentPage]);
  const handleNextPage = useCallback(() => onPageChange(currentPage + 1), [onPageChange, currentPage]);

  return (
    <div className="flex flex-wrap items-center justify-between py-4 gap-4">
      <div className="flex items-center space-x-2">
        <Input placeholder="Search player..." value={searchQuery} onChange={handleSearchChange} className="h-8 w-40" />
      </div>
      <div className="flex items-center space-x-2">
        <span className="text-sm text-muted-foreground">Rows per page</span>
        <Select value={String(itemsPerPage)} onValueChange={handleItemsPerPageChange}>
          <SelectTrigger className="h-8 w-20">
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
      <span className="text-sm text-muted-foreground flex items-center space-x-1">
        Page
        <span className="mx-2">
          <Input
            type="number"
            min={1}
            value={currentPage + 1}
            onChange={handlePageInputChange}
            className="h-8 w-16 text-center"
          />
        </span>
      </span>
      <div className="flex items-center space-x-2">
        <Button variant="outline" size="sm" onClick={handlePreviousPage} disabled={currentPage === 0}>
          Previous
        </Button>
        <Button variant="outline" size="sm" onClick={handleNextPage} disabled={!hasNextPage}>
          Next
        </Button>
      </div>
    </div>
  );
}
