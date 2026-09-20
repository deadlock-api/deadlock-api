import { PaginationControls } from "~/components/patterns/data-table/PaginationControls";
import { Input } from "~/components/ui/input";
import { SearchInput } from "~/components/ui/search-input";

export interface LeaderboardControlsProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  itemsPerPage: number;
  setItemsPerPage: (items: number) => void;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  totalPages: number;
  onJumpToRank: (rank: number) => void;
}

export function LeaderboardControls({
  searchQuery,
  setSearchQuery,
  itemsPerPage,
  setItemsPerPage,
  currentPage,
  setCurrentPage,
  totalPages,
  onJumpToRank,
}: LeaderboardControlsProps) {
  return (
    <PaginationControls
      page={currentPage}
      onPageChange={(page) => setCurrentPage(page)}
      pageSize={itemsPerPage}
      onPageSizeChange={(items) => {
        setItemsPerPage(items);
        setCurrentPage(0);
      }}
      totalPages={totalPages}
    >
      <SearchInput
        size="sm"
        placeholder="Search player..."
        aria-label="Search player"
        value={searchQuery}
        onValueChange={(query) => {
          setSearchQuery(query);
          if (query.length > 0) setCurrentPage(0);
        }}
      />
      <Input
        type="number"
        min={1}
        placeholder="Jump to rank"
        aria-label="Jump to rank"
        onChange={(e) => {
          const rank = parseInt(e.target.value, 10);
          if (!Number.isNaN(rank)) onJumpToRank(rank);
        }}
        className="h-8 w-36"
      />
    </PaginationControls>
  );
}
