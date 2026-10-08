import { useQuery } from "@tanstack/react-query";

import { HeroCell } from "~/components/domain/assets/HeroCell";
import { Delta } from "~/components/ui/delta";
import { NoValue } from "~/components/ui/no-value";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip, TooltipTarget } from "~/components/ui/tooltip";
import { bandBadges, RANK_BANDS, rankRangeLabel } from "~/lib/rank-utils";
import { cn } from "~/lib/utils";
import { ranksQueryOptions } from "~/queries/ranks-query";

interface BandRow {
  heroId: number;
  /** Win rate change per band of `RANK_BANDS`, in order. */
  deltas: (number | null)[];
}

/** The heroes a patch moved most differently in low and high ranks, with their win rate change in every band. */
export function PatchRankSplit({ rows }: { rows: readonly BandRow[] }) {
  const { data: ranks } = useQuery(ranksQueryOptions);
  return (
    <Table aria-label="Win rate change by rank" density="compact">
      <TableHeader>
        <TableRow>
          <TableHead scope="col" data-pinned>
            Hero
          </TableHead>
          {RANK_BANDS.map((band, index) => (
            <TableHead
              key={band.label}
              scope="col"
              className={cn("text-end", index === 1 && "hidden @md/table:table-cell")}
            >
              {/* The ranks a band holds, once their names are in. */}
              <Tooltip
                content={ranks && rankRangeLabel(ranks, bandBadges(band).min, bandBadges(band).max)}
                side="bottom"
              >
                <TooltipTarget>{band.label}</TooltipTarget>
              </Tooltip>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.heroId}>
            <TableCell data-pinned>
              <HeroCell heroId={row.heroId} linkToDetail />
            </TableCell>
            {row.deltas.map((delta, index) => (
              <TableCell
                key={RANK_BANDS[index].label}
                className={cn("text-end", index === 1 && "hidden @md/table:table-cell")}
              >
                {delta === null ? <NoValue label="Too few matches" /> : <Delta value={delta} unit=" pp" />}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
