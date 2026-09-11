import { useQuery } from "@tanstack/react-query";
import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import { UsersRound } from "lucide-react";
import { useMemo } from "react";

import { MODE_CONFIG } from "~/components/selectors/ModeSelector";
import { Button } from "~/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "~/components/ui/empty";
import { Skeleton } from "~/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { useSteamProfiles } from "~/hooks/useSteamProfiles";
import { type CompanionRow, intersectCompanionRows } from "~/lib/tracker/companions";
import type { TrackerFilterValues } from "~/lib/tracker/compute";
import { trackerEnemyStatsQueryOptions, trackerMateStatsQueryOptions } from "~/queries/tracker-queries";

import { EnemiesTab, MatesTab } from "../breakdown/PlayerStatsTable";
import { ExpandableDashboardPanel } from "./ExpandableDashboardPanel";

export function CompanionsPanel({
  accountId,
  filters,
  entries,
}: {
  accountId: number;
  filters: TrackerFilterValues;
  entries: PlayerMatchHistoryEntry[];
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

  return (
    <ExpandableDashboardPanel
      title="Teammates & opponents"
      icon={UsersRound}
      meta="Frequent encounters"
      details={
        <div className="grid gap-4 @4xl/overview:grid-cols-2">
          <div className="min-w-0">
            <h4 className="mb-2 text-xs font-semibold">Teammates</h4>
            <MatesTab {...params} entries={entries} />
          </div>
          <div className="min-w-0">
            <h4 className="mb-2 text-xs font-semibold">Opponents</h4>
            <EnemiesTab {...params} entries={entries} />
          </div>
        </div>
      }
    >
      <div className="@container/companions">
        <div className="grid gap-3 @xl/companions:grid-cols-2">
          <CompanionPreview
            label="Teammates"
            rows={mateRows}
            isPending={mates.isPending}
            isError={mates.isError}
            onRetry={() => mates.refetch()}
          />
          <CompanionPreview
            label="Opponents"
            rows={enemyRows}
            isPending={enemies.isPending}
            isError={enemies.isError}
            onRetry={() => enemies.refetch()}
          />
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Your win rate with teammates or against opponents · 2+ shared games in selected matches.
      </p>
    </ExpandableDashboardPanel>
  );
}

function CompanionPreview({
  label,
  rows,
  isPending,
  isError,
  onRetry,
}: {
  label: string;
  rows: CompanionRow[] | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const visible = (rows ?? []).filter((row) => row.matches >= 2).slice(0, 3);
  const { profiles, isLoading } = useSteamProfiles(visible.map((row) => row.accountId));

  return (
    <div className="min-w-0">
      <h4 className="mb-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">{label}</h4>
      {isPending ? (
        <div className="flex flex-col gap-2 py-2" aria-label={`Loading ${label.toLowerCase()}`}>
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </div>
      ) : isError ? (
        <Empty className="gap-2 px-2 py-3 md:p-3">
          <EmptyHeader>
            <EmptyDescription>Could not load {label.toLowerCase()}.</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" size="xs" onClick={onRetry}>
            Retry {label.toLowerCase()}
          </Button>
        </Empty>
      ) : visible.length === 0 ? (
        <Empty className="px-2 py-3 md:p-3">
          <EmptyHeader>
            <EmptyDescription>No repeat {label.toLowerCase()} in selected matches.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table aria-label={`Frequent ${label.toLowerCase()} in selected matches`}>
          <TableHeader>
            <TableRow>
              <TableHead className="h-6 px-0 text-[10px]">Player</TableHead>
              <TableHead className="h-6 px-1 text-right text-[10px]">Games</TableHead>
              <TableHead className="h-6 pr-0 pl-1 text-right text-[10px]">Win %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => {
              const profile = profiles[row.accountId];
              return (
                <TableRow key={row.accountId}>
                  <TableCell className="w-full max-w-0 py-2 pr-2 pl-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {profile?.avatar && (
                        <img src={profile.avatar} alt="" className="size-5 shrink-0 rounded-full" loading="lazy" />
                      )}
                      {isLoading && !profile ? (
                        <Skeleton className="h-4 w-24" />
                      ) : (
                        <span className="truncate text-xs" title={profile?.personaname ?? `Player ${row.accountId}`}>
                          {profile?.personaname ?? `Player ${row.accountId}`}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-1 py-2 text-right text-xs tabular-nums">
                    {row.matches.toLocaleString("en-US")}
                  </TableCell>
                  <TableCell className="py-2 pr-0 pl-1 text-right text-xs tabular-nums">
                    {((row.wins / row.matches) * 100).toFixed(0)}%
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
