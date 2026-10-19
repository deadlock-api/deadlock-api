import { useQuery } from "@tanstack/react-query";
import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import { useMemo } from "react";

import { hasSoulEconomy, MODE_CONFIG } from "~/lib/game-mode";
import type { TrackerFilterValues } from "~/lib/tracker/compute";
import { type StatMatch, summarizeLanes, trendMetricsFor } from "~/lib/tracker/match-stats";
import { trackerMatchStatsQueryOptions } from "~/queries/tracker-queries";

import { LaningPanel } from "./LaningPanel";
import { StatTrendsPanel } from "./StatTrendsPanel";

/** Laning and stat trends, from each selected match's stored stats beyond its match history row. */
export function MatchStatsPanels({
  accountId,
  filters,
  entries,
}: {
  accountId: number;
  filters: TrackerFilterValues;
  entries: PlayerMatchHistoryEntry[];
}) {
  const mode = MODE_CONFIG[filters.mode];
  const query = useQuery(
    trackerMatchStatsQueryOptions({
      accountId,
      gameMode: mode.gameMode,
      matchMode: mode.matchMode,
      heroId: filters.heroId,
      minUnixTimestamp: filters.minUnixTimestamp,
      maxUnixTimestamp: filters.maxUnixTimestamp,
    }),
  );
  const laned = mode.gameMode === "normal";
  const metrics = useMemo(() => trendMetricsFor(hasSoulEconomy(mode.gameMode), laned), [mode.gameMode, laned]);
  const matches = useMemo<StatMatch[]>(() => {
    const byId = new Map(query.data?.map((stats) => [stats.match_id, stats]));
    return entries.map((entry) => ({ entry, stats: byId.get(entry.match_id) }));
  }, [entries, query.data]);
  const lanes = useMemo(() => summarizeLanes(matches), [matches]);
  // History rows load first; the per-match stats fill in, so only their own readings wait.
  const state = query.isError && !query.data ? "error" : query.isPending ? "loading" : "ready";
  const retry = () => void query.refetch();

  return (
    <>
      {laned && <LaningPanel matches={matches} summary={lanes} state={state} onRetry={retry} />}
      <StatTrendsPanel matches={matches} metrics={metrics} state={state} onRetry={retry} />
    </>
  );
}
