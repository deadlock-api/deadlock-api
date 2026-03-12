import { PaginationControls } from "~/components/PaginationControls";

export interface LeaderboardControlsProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  itemsPerPage: number;
  setItemsPerPage: (items: number) => void;
  currentPage: number;
  setCurrentPage: (page: number | ((prev: number) => number)) => void;
  totalPages: number;
}

export function LeaderboardControls({
  searchQuery,
  setSearchQuery,
  itemsPerPage,
  setItemsPerPage,
  currentPage,
  setCurrentPage,
  totalPages,
}: LeaderboardControlsProps) {
  return (
    <PaginationControls
      searchQuery={searchQuery}
      onSearchChange={(query) => {
        setSearchQuery(query);
        if (query.length > 0) setCurrentPage(0);
      }}
      itemsPerPage={itemsPerPage}
      onItemsPerPageChange={(items) => {
        setItemsPerPage(items);
        setCurrentPage(0);
      }}
      currentPage={currentPage}
      onPageChange={(page) => setCurrentPage(page)}
      totalPages={totalPages}
      searchPlaceholder="Search player..."
    />
  );
}
