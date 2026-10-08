import { HeroCell } from "~/components/domain/assets/HeroCell";
import { Delta } from "~/components/ui/delta";
import { NoValue } from "~/components/ui/no-value";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { RANK_BANDS } from "~/lib/rank-utils";

interface BandRow {
  heroId: number;
  /** Win rate change per band of `RANK_BANDS`, in order. */
  deltas: (number | null)[];
}

/** The heroes a patch moved most differently in low and high ranks, with their win rate change in every band. */
export function PatchRankSplit({ rows }: { rows: readonly BandRow[] }) {
  return (
    <Table aria-label="Win rate change by rank" density="compact">
      <TableHeader>
        <TableRow>
          <TableHead scope="col" data-pinned>
            Hero
          </TableHead>
          {RANK_BANDS.map((band) => (
            <TableHead key={band.label} scope="col" className="text-end">
              {band.label}
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
              <TableCell key={RANK_BANDS[index].label} className="text-end">
                {delta === null ? <NoValue label="Too few matches" /> : <Delta value={delta} unit=" pp" />}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
