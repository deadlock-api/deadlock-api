import type { HeroEntry } from "deadlock_api_client";

import { HeroCell } from "~/components/domain/assets/HeroCell";
import type { ScoreboardSort } from "~/components/domain/player-scoreboard/ScoreboardTable";
import { formatStatValue } from "~/components/domain/player-scoreboard/sort-options";
import { SortBySelector } from "~/components/domain/player-scoreboard/SortBySelector";
import { SortableHeader } from "~/components/patterns/data-table/SortableHeader";
import { TableEmptyRow } from "~/components/patterns/data-table/TableEmptyRow";
import { SortButton, ariaSort } from "~/components/ui/sort-button";
import { Inline } from "~/components/ui/stack";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";

export interface HeroScoreboardTableProps {
  entries: HeroEntry[];
  sortBy: string;
  sortDirection: "desc" | "asc";
  /** The header always sets column and direction together, so one callback carries both. */
  onSortChange: (sort: ScoreboardSort) => void;
}

export function HeroScoreboardTable({ entries, sortBy, sortDirection, onSortChange }: HeroScoreboardTableProps) {
  const flip = (): "desc" | "asc" => (sortDirection === "desc" ? "asc" : "desc");
  const handleMatchesClick = () => {
    onSortChange(
      sortBy === "matches" ? { sortBy, sortDirection: flip() } : { sortBy: "matches", sortDirection: "desc" },
    );
  };

  return (
    <Table>
      <TableHeader tone="muted">
        <TableRow>
          <TableHead className="w-10 text-end">#</TableHead>
          <TableHead data-pinned>Hero</TableHead>
          {sortBy !== "matches" && (
            <SortableHeader
              label="Matches"
              sortKey="matches"
              activeSortKey={sortBy}
              sortDir={sortDirection}
              align="end"
              className="hidden sm:table-cell"
              onSortChange={handleMatchesClick}
            />
          )}
          <TableHead aria-sort={ariaSort(true, sortDirection)} className="text-end">
            <Inline gap={1} justify="end" wrap="nowrap">
              <SortBySelector
                value={sortBy}
                defaultValue="winrate"
                onValueChange={(value) => onSortChange({ sortBy: value, sortDirection })}
              />
              <SortButton
                active
                sortDir={sortDirection}
                onClick={() => onSortChange({ sortBy, sortDirection: flip() })}
                className="text-muted-foreground"
                aria-label="Toggle sort direction"
              />
            </Inline>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.hero_id}>
            <TableCell className="text-end">{entry.rank}</TableCell>
            <TableCell data-pinned className="max-w-60">
              <HeroCell heroId={entry.hero_id} size="sm" linkToDetail />
            </TableCell>
            {sortBy !== "matches" && (
              <TableCell className="hidden text-end sm:table-cell">{entry.matches.toLocaleString("en-US")}</TableCell>
            )}
            <TableCell className="text-end">{formatStatValue(entry.value, sortBy)}</TableCell>
          </TableRow>
        ))}
        {entries.length === 0 && <TableEmptyRow colSpan={sortBy === "matches" ? 3 : 4} />}
      </TableBody>
    </Table>
  );
}
