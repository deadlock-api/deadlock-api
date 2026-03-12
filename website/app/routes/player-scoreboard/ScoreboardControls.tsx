import { PaginationControls } from "~/components/PaginationControls";

export interface ScoreboardControlsProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  itemsPerPage: number;
  onItemsPerPageChange: (items: number) => void;
  currentPage: number;
  onPageChange: (page: number) => void;
  hasNextPage: boolean;
  totalEntries: number;
}

export function ScoreboardControls({
  searchQuery,
  setSearchQuery,
  itemsPerPage,
  onItemsPerPageChange,
  currentPage,
  onPageChange,
  hasNextPage,
  totalEntries,
}: ScoreboardControlsProps) {
  const totalPages = Math.max(1, Math.ceil(totalEntries / itemsPerPage));
  return (
    <PaginationControls
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      itemsPerPage={itemsPerPage}
      onItemsPerPageChange={onItemsPerPageChange}
      currentPage={currentPage}
      onPageChange={onPageChange}
      totalPages={totalPages}
      searchPlaceholder="Search player..."
    />
  );
}
