import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import { useMemo } from "react";

import { PlayerCell } from "~/components/domain/player/PlayerCell";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { SkeletonRows } from "~/components/patterns/states/Skeletons";
import { Heading } from "~/components/ui/heading";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { useSteamProfiles } from "~/hooks/useSteamProfiles";
import { formatPercent } from "~/lib/format";
import type { TeammatePairRow } from "~/lib/tracker/teammate-pairs";

import { CompanionMatchesDialog } from "./CompanionMatchesDialog";

/** Two teammates both on the player's team, with the player's results in those matches. `limit` trims a preview. */
export function TeammatePairs({
  pairs,
  isPending,
  isError,
  isFetching,
  onRetry,
  limit,
  entries,
  onOpenMatch,
}: {
  pairs: TeammatePairRow[] | undefined;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  limit?: number;
  entries: PlayerMatchHistoryEntry[];
  onOpenMatch: (matchId: number) => void;
}) {
  if (isPending) return <SkeletonRows rows={3} size="sm" variant="solid" label="teammate pairs" className="py-2" />;
  if (!pairs)
    return isError ? (
      <ErrorState variant="inline" title="Could not load teammate pairs" onRetry={onRetry} retrying={isFetching} />
    ) : null;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Heading as="h4" size="eyebrow">
        Teammate pairs
      </Heading>
      <PairsTable pairs={limit == null ? pairs : pairs.slice(0, limit)} entries={entries} onOpenMatch={onOpenMatch} />
    </div>
  );
}

function PairsTable({
  pairs,
  entries,
  onOpenMatch,
}: {
  pairs: TeammatePairRow[];
  entries: PlayerMatchHistoryEntry[];
  onOpenMatch: (matchId: number) => void;
}) {
  const accountIds = useMemo(() => [...new Set(pairs.flatMap((pair) => pair.memberIds))], [pairs]);
  const { profiles, isLoading } = useSteamProfiles(accountIds);
  const nameOf = (accountId: number) => profiles[accountId]?.personaname ?? `Player ${accountId}`;

  if (pairs.length === 0)
    return (
      <EmptyState variant="inline" className="py-3 text-xs" title="No repeat teammate pairs in selected matches." />
    );
  return (
    <Table density="dense" aria-label="Teammate pairs in selected matches">
      <TableHeader>
        <TableRow>
          <TableHead className="ps-0 text-xs">With</TableHead>
          <TableHead className="text-end text-xs">Games</TableHead>
          <TableHead className="pe-0 text-end text-xs">Win %</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pairs.map((pair) => (
          <TableRow key={pair.memberIds.join(",")}>
            <TableCell className="w-full max-w-0 ps-0">
              <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
                {pair.memberIds.map((accountId) => {
                  const profile = profiles[accountId];
                  return (
                    <PlayerCell
                      key={accountId}
                      size="sm"
                      accountId={accountId}
                      name={profile?.personaname}
                      avatar={profile?.avatar}
                      loading={isLoading && !profile}
                      linkToDetail
                      className="max-w-full"
                    />
                  );
                })}
              </span>
            </TableCell>
            <TableCell className="text-end tabular-nums">
              <CompanionMatchesDialog
                row={{ ...pair, accountId: pair.memberIds[0] }}
                name={pair.memberIds.map(nameOf).join(" + ")}
                relation="with"
                entries={entries}
                onOpenMatch={onOpenMatch}
                className="text-xs"
              />
            </TableCell>
            <TableCell className="pe-0 text-end tabular-nums">{formatPercent(pair.wins / pair.matches, 0)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
