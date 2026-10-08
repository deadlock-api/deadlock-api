import { useQuery } from "@tanstack/react-query";
import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import { useMemo } from "react";

import { MODE_CONFIG } from "~/lib/game-mode";
import { intersectCompanionRows } from "~/lib/tracker/companions";
import type { TrackerFilterValues } from "~/lib/tracker/compute";
import { trackerEnemyStatsQueryOptions, trackerMateStatsQueryOptions } from "~/queries/tracker-queries";

interface CompanionScope {
  accountId: number;
  filters: TrackerFilterValues;
  /** The filter-bar-scoped match history; companion stats are intersected with it so every filter applies. */
  entries: PlayerMatchHistoryEntry[];
}

function companionParams({ accountId, filters }: CompanionScope) {
  return {
    accountId,
    gameMode: MODE_CONFIG[filters.mode].gameMode,
    minUnixTimestamp: filters.minUnixTimestamp ?? undefined,
    maxUnixTimestamp: filters.maxUnixTimestamp ?? undefined,
  };
}

/** The players the tracked player played with in the filtered matches, the tracked player left out. */
export function useMateRows(scope: CompanionScope) {
  const { accountId, entries } = scope;
  const query = useQuery(trackerMateStatsQueryOptions(companionParams(scope)));
  const rows = useMemo(
    () =>
      intersectCompanionRows(
        query.data
          ?.filter((mate) => mate.mate_id !== accountId)
          .map((mate) => ({ id: mate.mate_id, matches: mate.matches })),
        entries,
      ),
    [query.data, accountId, entries],
  );
  return { query, rows };
}

/** The players the tracked player played against in the filtered matches. */
export function useEnemyRows(scope: CompanionScope) {
  const { entries } = scope;
  const query = useQuery(trackerEnemyStatsQueryOptions(companionParams(scope)));
  const rows = useMemo(
    () =>
      intersectCompanionRows(
        query.data?.map((enemy) => ({ id: enemy.enemy_id, matches: enemy.matches })),
        entries,
      ),
    [query.data, entries],
  );
  return { query, rows };
}
