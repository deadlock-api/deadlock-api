import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { useCallback } from "react";

const PAGE_SIZE_VALUES = [10, 25, 50, 100];

/** Search, page, and page size of a paginated table, kept in the URL so a view can be shared. */
export function usePaginationQueryState() {
  const [searchQuery, setSearchQuery] = useQueryState(
    "q",
    parseAsString.withDefault("").withOptions({ history: "replace" }),
  );
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
  const [itemsPerPage, setItemsPerPage] = useQueryState("per_page", parseAsInteger.withDefault(25));

  const setCurrentPage = useCallback((index: number) => setPage(index + 1), [setPage]);

  return {
    searchQuery,
    setSearchQuery,
    currentPage: Math.max(0, page - 1),
    setCurrentPage,
    itemsPerPage: PAGE_SIZE_VALUES.includes(itemsPerPage) ? itemsPerPage : 25,
    setItemsPerPage,
  };
}
