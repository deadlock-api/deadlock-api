import type { AnalyticsGameStats } from "deadlock_api_client";

import { Delta } from "~/components/ui/delta";
import { NoValue } from "~/components/ui/no-value";
import { DivergingBar } from "~/components/ui/rate-bar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { formatStatValue, getStatDefinition } from "~/lib/game-stat-definitions";
import type { StatChange } from "~/lib/patch-deltas";

/**
 * The game stats the patch moved beyond their day-to-day swing, before and after. Beside a wide table the change is
 * drawn as a signed bar, on one scale per column of units; on a phone before and after sit under the stat's name so the
 * change keeps its column.
 */
export function PatchStatChanges({ changes }: { changes: readonly StatChange<keyof AnalyticsGameStats>[] }) {
  const scale = Math.max(...changes.map(({ delta }) => Math.abs(delta)), 1);
  return (
    <Table aria-label="Game stat changes" density="compact">
      <TableHeader>
        <TableRow>
          <TableHead scope="col" data-pinned>
            Stat
          </TableHead>
          <TableHead scope="col" className="hidden text-end @md/table:table-cell">
            Before
          </TableHead>
          <TableHead scope="col" className="hidden text-end @md/table:table-cell">
            After
          </TableHead>
          <TableHead scope="col" className="text-end">
            Change
          </TableHead>
          <TableHead scope="col" className="hidden w-40 @xl/table:table-cell">
            <span className="sr-only">Change as a bar</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {changes.map(({ key, before, after, delta }) => {
          const stat = getStatDefinition(key);
          if (!stat) return null;
          return (
            <TableRow key={key}>
              <TableCell data-pinned className="whitespace-normal">
                {stat.label}
                <span className="block type-caption text-muted-foreground tabular-nums @md/table:hidden">
                  {formatStatValue(before, stat.format) ?? <NoValue label="No data" />} →{" "}
                  {formatStatValue(after, stat.format) ?? <NoValue label="No data" />}
                </span>
              </TableCell>
              <TableCell className="hidden text-end tabular-nums @md/table:table-cell">
                {formatStatValue(before, stat.format) ?? <NoValue label="No data" />}
              </TableCell>
              <TableCell className="hidden text-end tabular-nums @md/table:table-cell">
                {formatStatValue(after, stat.format) ?? <NoValue label="No data" />}
              </TableCell>
              <TableCell className="text-end">
                <Delta
                  value={delta}
                  unit={stat.format === "percent" ? " pp" : undefined}
                  polarity={stat.polarity ?? "neutral"}
                />
              </TableCell>
              <TableCell className="hidden @xl/table:table-cell">
                <DivergingBar value={delta} scale={scale} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
