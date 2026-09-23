import { useQuery } from "@tanstack/react-query";
import type { PlayerMatchHistoryEntry, Rank } from "deadlock_api_client";
import { ExternalLink } from "lucide-react";
import { type ReactNode, useMemo } from "react";

import { BadgeImage } from "~/components/domain/assets/BadgeImage";
import { SteamAvatar } from "~/components/domain/player/SteamAvatar";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { InlineStat } from "~/components/ui/inline-stat";
import { TextLink } from "~/components/ui/text-link";
import { extractBadgeMap } from "~/lib/leaderboard";
import { formatPlaytime, peakRank, summarize } from "~/lib/tracker/compute";
import { steamProfileQueryOptions, trackerRankQueryOptions } from "~/queries/tracker-queries";

import { RefreshControl } from "./RefreshControl";
import { useTrackerTime } from "./useTrackerTime";

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
  const { toTime, fromNow } = useTrackerTime();

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
    // The filters take the column that is left over. It has to be a sized column, not `auto`: the filter bar is a
    // query container and would collapse to nothing in a column that asks it for its own width.
    <div className="@container">
      <div className="grid items-center gap-3 [grid-template-areas:'profile'_'rank'_'filters'] sm:grid-cols-[minmax(0,1fr)_auto] sm:[grid-template-areas:'profile_rank'_'filters_filters'] @7xl:grid-cols-[auto_minmax(0,1fr)_auto] @7xl:[grid-template-areas:'profile_filters_rank']">
        <div className="flex min-w-0 flex-col gap-1 [grid-area:profile]">
          <PageHeader
            media={
              <SteamAvatar
                src={profile?.avatarfull ?? profile?.avatar}
                loading={isLoadingProfile}
                size="lg"
                shape="rounded"
              />
            }
            title={
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{profile?.personaname ?? `Player ${accountId}`}</span>
                {profile?.profileurl && (
                  <TextLink
                    href={profile.profileurl}
                    target="_blank"
                    rel="noopener noreferrer"
                    tone="muted"
                    aria-label="Open Steam profile"
                    title="Open Steam profile"
                  >
                    <ExternalLink aria-hidden="true" className="size-4" />
                  </TextLink>
                )}
              </span>
            }
            description={
              <span className="flex flex-wrap items-center gap-x-1.5">
                <span>
                  <span className="font-mono">{accountId}</span>
                  {summary?.lastPlayedUnix != null && <span> · last played {fromNow(summary.lastPlayedUnix)}</span>}
                </span>
                <RefreshControl accountId={accountId} />
              </span>
            }
          />
          {summary && (
            <section className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Across all loaded match history">
              <InlineStat value={summary.matches.toLocaleString("en-US")} label="recorded matches" />
              <InlineStat value={`${(summary.winrate * 100).toFixed(1)}%`} label="win rate" />
              <InlineStat value={formatPlaytime(summary.totalTimeS)} label="played" />
            </section>
          )}
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
                    title={`Peak reached ${toTime(peak.time).format("MMM D, YYYY")}`}
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
