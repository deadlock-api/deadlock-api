import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { CACHE_DURATIONS } from "~/constants/cache";
import { refreshTrackerAccount, trackerAccountQueries } from "~/lib/tracker/refresh";
import { cn } from "~/lib/utils";
import { trackerMatchHistoryQueryOptions } from "~/queries/tracker-queries";

const REFRESH_INTERVAL_MS = CACHE_DURATIONS.FIVE_MINUTES;
const MANUAL_REFRESH_COOLDOWN_MS = 60 * 1000;

function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Keeps account data fresh, retrying failed history refreshes every five minutes. */
export function RefreshControl({ accountId }: { accountId: number }) {
  const queryClient = useQueryClient();
  const { dataUpdatedAt, errorUpdatedAt, isError, fetchStatus } = useQuery(trackerMatchHistoryQueryOptions(accountId));
  const isPaused = fetchStatus === "paused";
  const isFetching = useIsFetching(trackerAccountQueries(accountId)) > 0;
  // A failed attempt starts another interval too, so automatic refresh recovers without rapid retries.
  const lastAttemptAt = Math.max(dataUpdatedAt, errorUpdatedAt);
  const dueAt = lastAttemptAt + REFRESH_INTERVAL_MS;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (lastAttemptAt === 0 || isFetching) return;
    const timer = setTimeout(() => refreshTrackerAccount(queryClient, accountId), Math.max(0, dueAt - Date.now()));
    return () => clearTimeout(timer);
  }, [lastAttemptAt, dueAt, queryClient, accountId, isFetching]);

  const remaining = dueAt - now;
  // Failed attempts count against the cooldown too, so a flaky endpoint cannot be hammered.
  const onCooldown = lastAttemptAt + MANUAL_REFRESH_COOLDOWN_MS > now;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
      <Button
        variant="ghost"
        size="xs"
        onClick={() => refreshTrackerAccount(queryClient, accountId)}
        disabled={isFetching || isPaused || onCooldown}
        title="Refresh this player's history, rank and breakdowns, at most once a minute. Also refreshes every 5 minutes."
      >
        <RefreshCw data-icon="inline-start" className={cn(isFetching && "animate-spin")} />
        Refresh
      </Button>
      {isError && !isFetching && !isPaused && (
        <output className="text-xs">
          {dataUpdatedAt > 0 ? "Refresh failed · showing loaded history" : "Could not load matches"}
        </output>
      )}
      {isPaused ? (
        <span className="text-xs">Waiting for connection…</span>
      ) : isFetching ? (
        <span className="text-xs">Refreshing…</span>
      ) : (
        lastAttemptAt > 0 &&
        remaining > 0 && <span className="text-xs tabular-nums">next in {formatCountdown(remaining)}</span>
      )}
    </span>
  );
}
