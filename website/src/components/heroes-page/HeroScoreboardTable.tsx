import type { HeroEntry } from "deadlock_api_client";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { formatStatValue } from "~/components/player-scoreboard/sort-options";
import { SortBySelector } from "~/components/player-scoreboard/SortBySelector";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { cn } from "~/lib/utils";

export interface HeroScoreboardTableProps {
  entries: HeroEntry[];
  sortBy: string;
  sortDirection: "desc" | "asc";
  onSortByChange: (value: string) => void;
  onSortDirectionChange: (dir: "desc" | "asc") => void;
}

function DirectionIcon({ active, sortDirection }: { active: boolean; sortDirection: "desc" | "asc" }) {
  if (!active) return <ArrowUpDown className="size-3.5 text-muted-foreground/50" />;
  return sortDirection === "desc" ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />;
}

export function HeroScoreboardTable({
  entries,
  sortBy,
  sortDirection,
  onSortByChange,
  onSortDirectionChange,
}: HeroScoreboardTableProps) {
  const handleMatchesClick = () => {
    if (sortBy === "matches") {
      onSortDirectionChange(sortDirection === "desc" ? "asc" : "desc");
    } else {
      onSortByChange("matches");
      onSortDirectionChange("desc");
    }
  };

  return (
    <Table>
      <TableHeader className="bg-muted">
        <TableRow>
          <TableHead className="w-[5ch] text-right">#</TableHead>
          <TableHead>Hero</TableHead>
          {sortBy !== "matches" && (
            <TableHead className="text-right">
              <button
                type="button"
                onClick={handleMatchesClick}
                className={cn(
                  "inline-flex cursor-pointer items-center justify-end gap-1 transition-colors hover:text-foreground",
                )}
              >
                <span>Matches</span>
                <DirectionIcon active={false} sortDirection={sortDirection} />
              </button>
            </TableHead>
          )}
          <TableHead className="text-right">
            <div className="flex items-center justify-end gap-1">
              <SortBySelector value={sortBy} onChange={onSortByChange} />
              <button
                type="button"
                onClick={() => onSortDirectionChange(sortDirection === "desc" ? "asc" : "desc")}
                className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Toggle sort direction"
              >
                <DirectionIcon active sortDirection={sortDirection} />
              </button>
            </div>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.hero_id}>
            <TableCell className="text-right">{entry.rank}</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <HeroImage heroId={entry.hero_id} className="size-6" />
                <HeroName heroId={entry.hero_id} className="max-w-[200px]" linkToDetail />
              </div>
            </TableCell>
            {sortBy !== "matches" && <TableCell className="text-right">{entry.matches.toLocaleString()}</TableCell>}
            <TableCell className="text-right">{formatStatValue(entry.value, sortBy)}</TableCell>
          </TableRow>
        ))}
        {entries.length === 0 && (
          <TableRow>
            <TableCell colSpan={sortBy === "matches" ? 3 : 4} className="py-8 text-center text-muted-foreground">
              No results found
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
