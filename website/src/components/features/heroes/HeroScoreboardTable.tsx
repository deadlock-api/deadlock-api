import type { HeroEntry } from "deadlock_api_client";

import { HeroCell } from "~/components/domain/assets/HeroCell";
import type { ScoreboardSort } from "~/components/domain/player-scoreboard/ScoreboardTable";
import { SortableHeader } from "~/components/patterns/data-table/SortableHeader";
import { TableEmptyRow } from "~/components/patterns/data-table/TableEmptyRow";
import { useSort } from "~/components/ui/hooks/use-sort";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { findKey } from "~/lib/find-keys";
import { formatStatValue, sortByLabel } from "~/lib/scoreboard-sorts";

export interface HeroScoreboardTableProps {
  entries: HeroEntry[];
  sortBy: string;
  sortDirection: "desc" | "asc";
  /** The header always sets column and direction together, so one callback carries both. */
  onSortChange: (sort: ScoreboardSort) => void;
}

export function HeroScoreboardTable({ entries, sortBy, sortDirection, onSortChange }: HeroScoreboardTableProps) {
  const sort = useSort<string>({
    value: { key: sortBy, dir: sortDirection },
    onValueChange: ({ key, dir }) => onSortChange({ sortBy: key, sortDirection: dir }),
  });

  return (
    <Table>
      <TableHeader tone="muted">
        <TableRow>
          <TableHead className="w-10 text-end">#</TableHead>
          <TableHead data-pinned>Hero</TableHead>
          {sortBy !== "matches" && (
            <SortableHeader
              data-find={findKey.stat("matches")}
              label="Matches"
              sortKey="matches"
              activeSortKey={sortBy}
              sortDir={sortDirection}
              align="end"
              className="hidden sm:table-cell"
              onSortChange={sort.toggle}
            />
          )}
          {/* The stat is picked in the scoreboard's toolbar; its column header flips the direction. */}
          <SortableHeader
            data-find={findKey.stat(sortBy)}
            label={sortByLabel(sortBy)}
            sortKey={sortBy}
            activeSortKey={sortBy}
            sortDir={sortDirection}
            align="end"
            onSortChange={sort.toggle}
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.hero_id} data-find={findKey.hero(entry.hero_id)}>
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
