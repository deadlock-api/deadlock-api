import { JumpInput } from "~/components/patterns/data-table/JumpInput";
import { PaginationControls } from "~/components/patterns/data-table/PaginationControls";
import { SearchInput } from "~/components/ui/search-input";

export interface LeaderboardControlsProps {
  /** `header`: search, jump and paging above the rows. `footer`: only the paging, under them. */
  placement: "header" | "footer";
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
  placement,
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
      placement={placement}
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
        placeholder="Search player…"
        aria-label="Search player"
        value={searchQuery}
        onValueChange={(query) => {
          setSearchQuery(query);
          if (query.length > 0) setCurrentPage(0);
        }}
      />
      <JumpInput
        min={1}
        placeholder="Jump to rank"
        aria-label="Jump to rank"
        onCommit={onJumpToRank}
        size="sm"
        className="w-36"
      />
    </PaginationControls>
  );
}
