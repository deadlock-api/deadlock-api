import { JumpInput } from "~/components/patterns/data-table/JumpInput";
import { PaginationControls } from "~/components/patterns/data-table/PaginationControls";

export interface LeaderboardControlsProps {
  /** `header`: jump and paging above the rows (the name search is in the Account Name head). `footer`: the paging. */
  placement: "header" | "footer";
  itemsPerPage: number;
  setItemsPerPage: (items: number) => void;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  totalPages: number;
  onJumpToRank: (rank: number) => void;
}

export function LeaderboardControls({
  placement,
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
