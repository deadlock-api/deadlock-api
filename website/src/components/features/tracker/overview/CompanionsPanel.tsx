import { useQuery } from "@tanstack/react-query";
import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import { UsersRound } from "lucide-react";
import { useMemo, useState } from "react";

import { PlayerCell } from "~/components/domain/player/PlayerCell";
import { CompanionMatchesDialog } from "~/components/features/tracker/breakdown/CompanionMatchesDialog";
import { EnemiesTab, MatesTab } from "~/components/features/tracker/breakdown/PlayerStatsTable";
import { PanelWithDetails } from "~/components/patterns/panel/PanelWithDetails";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { SkeletonRows } from "~/components/patterns/states/Skeletons";
import { Button } from "~/components/ui/button";
import { Heading } from "~/components/ui/heading";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { useSteamProfiles } from "~/hooks/useSteamProfiles";
import { MODE_CONFIG } from "~/lib/game-mode";
import { type CompanionRow, intersectCompanionRows } from "~/lib/tracker/companions";
import type { TrackerFilterValues } from "~/lib/tracker/compute";
import { trackerEnemyStatsQueryOptions, trackerMateStatsQueryOptions } from "~/queries/tracker-queries";

export function CompanionsPanel({
  accountId,
  filters,
  entries,
  onOpenMatch,
}: {
  accountId: number;
  filters: TrackerFilterValues;
  entries: PlayerMatchHistoryEntry[];
  onOpenMatch: (matchId: number) => void;
}) {
  const params = {
    accountId,
    gameMode: MODE_CONFIG[filters.mode].gameMode,
    minUnixTimestamp: filters.minUnixTimestamp ?? undefined,
    maxUnixTimestamp: filters.maxUnixTimestamp ?? undefined,
  };
  const mates = useQuery(trackerMateStatsQueryOptions(params));
  const enemies = useQuery(trackerEnemyStatsQueryOptions(params));
  const mateRows = useMemo(
    () =>
      intersectCompanionRows(
        mates.data
          ?.filter((mate) => mate.mate_id !== accountId)
          .map((mate) => ({ id: mate.mate_id, matches: mate.matches })),
        entries,
      ),
    [mates.data, accountId, entries],
  );
  const enemyRows = useMemo(
    () =>
      intersectCompanionRows(
        enemies.data?.map((enemy) => ({ id: enemy.enemy_id, matches: enemy.matches })),
        entries,
      ),
    [enemies.data, entries],
  );
  const [open, setOpen] = useState(false);

  return (
    <PanelWithDetails
      title="Teammates & opponents"
      icon={UsersRound}
      description="Frequent encounters"
      footer="Your win rate · 2+ shared games in selected matches"
      open={open}
      onOpenChange={setOpen}
      details={
        <div className="grid gap-4 @4xl/stats-dialog:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">
            <Heading as="h4" size="xs">
              Teammates
            </Heading>
            <MatesTab
              accountId={accountId}
              filters={filters}
              entries={entries}
              onOpenMatch={(id) => {
                setOpen(false);
                onOpenMatch(id);
              }}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <Heading as="h4" size="xs">
              Opponents
            </Heading>
            <EnemiesTab
              accountId={accountId}
              filters={filters}
              entries={entries}
              onOpenMatch={(id) => {
                setOpen(false);
                onOpenMatch(id);
              }}
            />
          </div>
        </div>
      }
    >
      <div className="@container/companions">
        <div className="grid gap-3 @xl/companions:grid-cols-2">
          <CompanionPreview
            label="Teammates"
            relation="with"
            entries={entries}
            onOpenMatch={onOpenMatch}
            rows={mateRows}
            isPending={mates.isPending}
            isError={mates.isError}
            isFetching={mates.isFetching}
            onRetry={() => mates.refetch()}
          />
          <CompanionPreview
            label="Opponents"
            relation="against"
            entries={entries}
            onOpenMatch={onOpenMatch}
            rows={enemyRows}
            isPending={enemies.isPending}
            isError={enemies.isError}
            isFetching={enemies.isFetching}
            onRetry={() => enemies.refetch()}
          />
        </div>
      </div>
    </PanelWithDetails>
  );
}

function CompanionPreview({
  label,
  rows,
  isPending,
  isError,
  isFetching,
  onRetry,
  relation,
  entries,
  onOpenMatch,
}: {
  label: string;
  rows: CompanionRow[] | undefined;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  relation: "with" | "against";
  entries: PlayerMatchHistoryEntry[];
  onOpenMatch: (matchId: number) => void;
}) {
  const visible = (rows ?? []).filter((row) => row.matches >= 2).slice(0, 3);
  const { profiles, isLoading } = useSteamProfiles(visible.map((row) => row.accountId));

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Heading as="h4" size="eyebrow">
        {label}
      </Heading>
      {isPending ? (
        <SkeletonRows rows={3} size="sm" variant="solid" label={label.toLowerCase()} className="py-2" />
      ) : isError && rows === undefined ? (
        <ErrorState
          variant="inline"
          title={`Could not load ${label.toLowerCase()}`}
          onRetry={onRetry}
          retrying={isFetching}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          variant="inline"
          className="py-3 text-xs"
          title={`No repeat ${label.toLowerCase()} in selected matches.`}
        />
      ) : (
        <Table density="dense" aria-label={`Frequent ${label.toLowerCase()} in selected matches`}>
          <TableHeader>
            <TableRow>
              <TableHead className="ps-0 text-3xs">Player</TableHead>
              <TableHead className="text-end text-3xs">Games</TableHead>
              <TableHead className="pe-0 text-end text-3xs">Win %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => {
              const profile = profiles[row.accountId];
              return (
                <TableRow key={row.accountId}>
                  <TableCell className="w-full max-w-0 ps-0">
                    <PlayerCell
                      size="sm"
                      accountId={row.accountId}
                      name={profile?.personaname}
                      avatar={profile?.avatar}
                      loading={isLoading && !profile}
                      linkToDetail
                    />
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    <CompanionMatchesDialog
                      row={row}
                      name={profile?.personaname ?? `Player ${row.accountId}`}
                      relation={relation}
                      entries={entries}
                      onOpenMatch={onOpenMatch}
                      className="text-xs"
                    />
                  </TableCell>
                  <TableCell className="pe-0 text-end tabular-nums">
                    {((row.wins / row.matches) * 100).toFixed(0)}%
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {isError && rows !== undefined && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <output className="text-3xs text-muted-foreground">Refresh failed. Showing loaded results.</output>
          <Button variant="ghost" size="xs" disabled={isFetching} onClick={onRetry}>
            Retry {label.toLowerCase()}
          </Button>
        </div>
      )}
    </div>
  );
}
