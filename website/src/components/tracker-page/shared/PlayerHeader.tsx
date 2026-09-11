import { useQuery } from "@tanstack/react-query";
import type { PlayerMatchHistoryEntry, Rank } from "deadlock_api_client";
import { ExternalLink, UserRound } from "lucide-react";
import { type ReactNode, useMemo } from "react";

import { BadgeImage } from "~/components/BadgeImage";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Skeleton } from "~/components/ui/skeleton";
import { day } from "~/dayjs";
import { extractBadgeMap } from "~/lib/leaderboard";
import { formatPlaytime, peakRank, summarize } from "~/lib/tracker/compute";
import { steamProfileQueryOptions, trackerRankQueryOptions } from "~/queries/tracker-queries";

import { RefreshControl } from "./RefreshControl";

export function PlayerHeader({
  accountId,
  entries,
  ranks,
  children,
}: {
  accountId: number;
  entries: PlayerMatchHistoryEntry[] | undefined;
  ranks: Rank[];
  /** The filter bar, centered between the profile and the rank when the header is wide enough, else below both. */
  children: ReactNode;
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
    // Equal outer columns keep the filters centered independently of profile and rank widths.
    <div className="@container">
      <div className="grid items-center gap-3 [grid-template-areas:'profile'_'rank'_'filters'] sm:grid-cols-[minmax(0,1fr)_auto] sm:[grid-template-areas:'profile_rank'_'filters_filters'] @7xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] @7xl:[grid-template-areas:'profile_filters_rank']">
        <div className="flex min-w-0 items-center gap-3 [grid-area:profile] sm:gap-3">
          {isLoadingProfile ? (
            <Skeleton className="size-12 shrink-0 rounded-xl" />
          ) : (
            <Avatar className="size-12 rounded-xl" aria-hidden="true">
              <AvatarImage src={profile?.avatarfull ?? profile?.avatar} alt="" />
              <AvatarFallback className="rounded-xl">
                <UserRound className="size-5" />
              </AvatarFallback>
            </Avatar>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-bold tracking-tight">
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
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
              <span>
                <span className="font-mono">{accountId}</span>
                {summary?.lastPlayedUnix != null && (
                  <span> · last played {day.unix(summary.lastPlayedUnix).fromNow()}</span>
                )}
              </span>
              <RefreshControl accountId={accountId} />
            </div>
            {summary && (
              <section
                className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs"
                aria-label="Across all loaded match history"
              >
                <span>
                  <span className="font-semibold tabular-nums">{summary.matches.toLocaleString("en-US")}</span>{" "}
                  <span className="text-muted-foreground">recorded matches</span>
                </span>
                <span>
                  <span className="font-semibold tabular-nums">{(summary.winrate * 100).toFixed(1)}%</span>{" "}
                  <span className="text-muted-foreground">win rate</span>
                </span>
                <span>
                  <span className="font-semibold tabular-nums">{formatPlaytime(summary.totalTimeS)}</span>{" "}
                  <span className="text-muted-foreground">played</span>
                </span>
              </section>
            )}
          </div>
        </div>
        <div className="min-w-0 [grid-area:filters]">{children}</div>
        {rank && rank.badge > 0 && (
          <div className="flex items-center gap-3 justify-self-start [grid-area:rank] sm:gap-2 sm:justify-self-end">
            <BadgeImage badge={rank.badge} ranks={ranks} className="size-12" />
            {badgeInfo && (
              <div className="text-center">
                <div className="text-sm font-semibold">
                  {badgeInfo.name} {badgeInfo.subtier}
                </div>
                {peak && (
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
    </div>
  );
}
