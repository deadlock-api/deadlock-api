import { useQuery } from "@tanstack/react-query";
import type { PlayerMatchHistoryEntry, Rank } from "deadlock_api_client";
import { ExternalLink } from "lucide-react";
import { useMemo } from "react";

import { BadgeImage } from "~/components/BadgeImage";
import { Skeleton } from "~/components/ui/skeleton";
import { day } from "~/dayjs";
import { extractBadgeMap } from "~/lib/leaderboard";
import { peakRank, summarize } from "~/lib/tracker/compute";
import { steamProfileQueryOptions, trackerRankQueryOptions } from "~/queries/tracker-queries";

export function PlayerHeader({
  accountId,
  entries,
  ranks,
}: {
  accountId: number;
  entries: PlayerMatchHistoryEntry[] | undefined;
  ranks: Rank[];
}) {
  const { data: profile, isLoading: isLoadingProfile } = useQuery(steamProfileQueryOptions(accountId));

  const { data: rank } = useQuery(trackerRankQueryOptions(accountId));

  const badgeInfo = useMemo(() => {
    if (!rank || rank.badge <= 0 || ranks.length === 0) return null;
    return extractBadgeMap(ranks).get(rank.badge) ?? null;
  }, [rank, ranks]);

  const summary = useMemo(() => (entries && entries.length > 0 ? summarize(entries) : null), [entries]);

  const peak = useMemo(() => {
    const found = entries ? peakRank(entries) : null;
    if (!found || ranks.length === 0) return null;
    const info = extractBadgeMap(ranks).get(found.badge);
    return info ? { ...found, name: `${info.name} ${info.subtier}` } : null;
  }, [entries, ranks]);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      {isLoadingProfile ? (
        <Skeleton className="size-20 rounded-xl" />
      ) : (
        <img
          src={profile?.avatarfull ?? profile?.avatar}
          alt=""
          className="size-20 rounded-xl border border-border bg-muted"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {profile?.personaname ?? `Player ${accountId}`}
          </h1>
          {profile?.profileurl && (
            <a
              href={profile.profileurl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground transition-colors hover:text-foreground"
              title="Open Steam profile"
            >
              <ExternalLink className="size-4" />
            </a>
          )}
        </div>
        <div className="mt-0.5 text-sm text-muted-foreground">
          <span className="font-mono">{accountId}</span>
          {summary?.lastPlayedUnix != null && <span> · last played {day.unix(summary.lastPlayedUnix).fromNow()}</span>}
        </div>
        {summary && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>
              <span className="font-semibold tabular-nums">{summary.matches.toLocaleString("en-US")}</span>{" "}
              <span className="text-muted-foreground">matches</span>
            </span>
            <span>
              <span className="font-semibold tabular-nums">{(summary.winrate * 100).toFixed(1)}%</span>{" "}
              <span className="text-muted-foreground">win rate</span>
            </span>
            <span>
              <span className="font-semibold tabular-nums">
                {Math.round(summary.totalTimeS / 3600).toLocaleString("en-US")}h
              </span>{" "}
              <span className="text-muted-foreground">played</span>
            </span>
          </div>
        )}
      </div>
      {rank && rank.badge > 0 && (
        <div className="flex items-center gap-3 sm:flex-col sm:gap-1">
          <BadgeImage badge={rank.badge} ranks={ranks} className="size-16" />
          {badgeInfo && (
            <div className="text-center">
              <div className="text-sm font-semibold">
                {badgeInfo.name} {badgeInfo.subtier}
              </div>
              {peak && peak.badge > rank.badge && (
                <div
                  className="text-xs whitespace-nowrap text-muted-foreground"
                  title={`Peak reached ${day.unix(peak.time).format("MMM D, YYYY")}`}
                >
                  Peak {peak.name}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
