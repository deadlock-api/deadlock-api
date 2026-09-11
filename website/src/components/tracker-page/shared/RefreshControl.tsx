import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { CACHE_DURATIONS } from "~/constants/cache";
import { cn } from "~/lib/utils";
import { queryKeys } from "~/queries/query-keys";
import { trackerMatchHistoryQueryOptions } from "~/queries/tracker-queries";

const REFRESH_INTERVAL_MS = CACHE_DURATIONS.FIVE_MINUTES;
const MANUAL_REFRESH_COOLDOWN_MS = 60 * 1000;

function refreshAccount(queryClient: QueryClient, accountId: number) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.players.matchHistory(accountId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.players.rank(accountId) }),
  ]);
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Keeps loaded match history and rank fresh, retrying failed refreshes every five minutes. */
export function RefreshControl({ accountId }: { accountId: number }) {
  const queryClient = useQueryClient();
  const { dataUpdatedAt, errorUpdatedAt, isFetching, isError } = useQuery(trackerMatchHistoryQueryOptions(accountId));
  // A failed attempt starts another interval too, so automatic refresh recovers without rapid retries.
  const dueAt = Math.max(dataUpdatedAt, errorUpdatedAt) + REFRESH_INTERVAL_MS;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (dataUpdatedAt === 0) return;
    const timer = setTimeout(() => refreshAccount(queryClient, accountId), Math.max(0, dueAt - Date.now()));
    return () => clearTimeout(timer);
  }, [dataUpdatedAt, dueAt, queryClient, accountId]);

  const remaining = dueAt - now;
  // Failed attempts count against the cooldown too, so a flaky endpoint cannot be hammered.
  const onCooldown = Math.max(dataUpdatedAt, errorUpdatedAt) + MANUAL_REFRESH_COOLDOWN_MS > now;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
      <Button
        variant="ghost"
        size="xs"
        onClick={() => refreshAccount(queryClient, accountId)}
        disabled={isFetching || onCooldown}
        title="Refresh now, at most once a minute. Match history also refreshes every 5 minutes."
      >
        <RefreshCw data-icon="inline-start" className={cn(isFetching && "animate-spin")} />
        Refresh
      </Button>
      {isError && !isFetching && (
        <output className="text-xs">
          {dataUpdatedAt > 0 ? "Refresh failed · showing saved matches" : "Could not load matches"}
        </output>
      )}
      {isFetching ? (
        <span className="text-xs">Refreshing…</span>
      ) : (
        dataUpdatedAt > 0 &&
        remaining > 0 && <span className="text-xs tabular-nums">next in {formatCountdown(remaining)}</span>
      )}
    </span>
  );
}
