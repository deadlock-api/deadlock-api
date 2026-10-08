import type { AnalyticsGameStats } from "deadlock_api_client";

import { Delta } from "~/components/ui/delta";
import { Stat, StatGroup } from "~/components/ui/stat";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { formatStatValue, getStatDefinition, type StatFormat } from "~/lib/game-stat-definitions";
import { type StatChange, statDelta } from "~/lib/patch-deltas";
import type { HeadlineStat, PatchReport } from "~/lib/patch-report-fns";

const HEADLINE: {
  key: keyof PatchReport["headline"];
  label: string;
  format: StatFormat;
  polarity?: "higher-is-better";
}[] = [
  { key: "matchesPerDay", label: "Matches per day", format: "integer", polarity: "higher-is-better" },
  { key: "gameLength", label: "Game length", format: "duration" },
  { key: "soulsPerMinute", label: "Souls per minute", format: "integer" },
  { key: "kills", label: "Kills per player", format: "decimal1" },
  { key: "firstMidBoss", label: "First mid boss", format: "duration" },
];

/** A headline's change, or nothing when it stayed within its day-to-day swing. */
function headlineDelta(stat: HeadlineStat, format: StatFormat): number | null {
  return stat.significant ? statDelta(format, stat.after, stat.before) : null;
}

/**
 * The headline numbers of a patch: match volume, game length and pace after it. An arrow marks only a change beyond
 * the number's day-to-day swing.
 */
export function PatchHeadline({ headline }: { headline: PatchReport["headline"] }) {
  return (
    <div className="@container">
      <StatGroup variant="joined" size="sm" className="grid-cols-2 @md:grid-cols-3 @2xl:grid-cols-5">
        {HEADLINE.map(({ key, label, format, polarity }) => {
          const delta = headlineDelta(headline[key], format);
          return (
            <Stat
              key={key}
              label={label}
              value={formatStatValue(headline[key].after, format)}
              sub={delta === null ? undefined : <Delta value={delta} polarity={polarity ?? "neutral"} sign="arrow" />}
            />
          );
        })}
      </StatGroup>
    </div>
  );
}

/** The game stats the patch moved beyond their day-to-day swing, before and after. */
export function PatchStatChanges({ changes }: { changes: readonly StatChange<keyof AnalyticsGameStats>[] }) {
  return (
    <Table aria-label="Game stat changes" density="compact">
      <TableHeader>
        <TableRow>
          <TableHead scope="col" data-pinned>
            Stat
          </TableHead>
          <TableHead scope="col" className="text-end">
            Before
          </TableHead>
          <TableHead scope="col" className="text-end">
            After
          </TableHead>
          <TableHead scope="col" className="text-end">
            Change
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {changes.map(({ key, before, after, delta }) => {
          const stat = getStatDefinition(key);
          if (!stat) return null;
          return (
            <TableRow key={key}>
              <TableCell data-pinned>{stat.label}</TableCell>
              <TableCell className="text-end tabular-nums">{formatStatValue(before, stat.format)}</TableCell>
              <TableCell className="text-end tabular-nums">{formatStatValue(after, stat.format)}</TableCell>
              <TableCell className="text-end">
                <Delta
                  value={delta}
                  unit={stat.format === "percent" ? " pp" : undefined}
                  polarity={stat.polarity ?? "neutral"}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
