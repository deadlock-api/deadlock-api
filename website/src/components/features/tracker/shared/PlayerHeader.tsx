import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { PlayerMatchHistoryEntry, Rank } from "deadlock_api_client";
import { ExternalLink, GitCompareArrows } from "lucide-react";
import { type ReactNode, useMemo } from "react";

import { BadgeImage } from "~/components/domain/assets/BadgeImage";
import { SteamAvatar } from "~/components/domain/player/SteamAvatar";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { Button } from "~/components/ui/button";
import { InlineStat } from "~/components/ui/inline-stat";
import { Skeleton } from "~/components/ui/skeleton";
import { TextLink } from "~/components/ui/text-link";
import { Tooltip, TooltipTarget } from "~/components/ui/tooltip";
import { formatPercent } from "~/lib/format";
import { extractBadgeMap } from "~/lib/leaderboard";
import { formatPlaytime, peakRank, summarize } from "~/lib/tracker/compute";
import { isDemoAccount } from "~/lib/tracker/demo";
import { cn } from "~/lib/utils";
import { steamProfileQueryOptions } from "~/queries/steam-queries";
import { trackerRankQueryOptions } from "~/queries/tracker-queries";

import { RefreshControl } from "./RefreshControl";
import { useTrackerTime } from "./useTrackerTime";

export function PlayerHeader({
  accountId,
  entries,
  ranks,
  as = "h1",
  children,
}: {
  accountId: number;
  entries: PlayerMatchHistoryEntry[] | undefined;
  ranks: Rank[];
  /** `h2` when the page names itself above the profile (the demo). */
  as?: "h1" | "h2";
  /** The filter bar, centered between the profile and the rank when the header is wide enough, else below both. */
  children: ReactNode;
}) {
  const { data: profile, isLoading: isLoadingProfile } = useQuery(steamProfileQueryOptions(accountId));

  const { data: rank, isPending: rankPending } = useQuery(trackerRankQueryOptions(accountId));
  // While the history loads, the lines it fills keep their room (invisible stand-ins), so the filters below do not jump.
  const historyPending = entries === undefined;
  const { toTime, fromNow } = useTrackerTime();

  const badgeMap = useMemo(() => extractBadgeMap(ranks), [ranks]);
  const badgeInfo = rank && rank.badge > 0 ? badgeMap.get(rank.badge) : undefined;

  const summary = useMemo(() => (entries && entries.length > 0 ? summarize(entries) : null), [entries]);

  const peak = useMemo(() => {
    const found = entries ? peakRank(entries) : null;
    const info = found && badgeMap.get(found.badge);
    return found && info ? { ...found, name: `${info.name} ${info.subtier}` } : null;
  }, [entries, badgeMap]);

  return (
    // The filters take the column that is left over. It has to be a sized column, not `auto`: the filter bar is a
    // query container and would collapse to nothing in a column that asks it for its own width.
    <div className="@container">
      <div className="grid items-center gap-3 [grid-template-areas:'profile'_'rank'_'filters'] sm:grid-cols-[minmax(0,1fr)_auto] sm:[grid-template-areas:'profile_rank'_'filters_filters'] @7xl:grid-cols-[auto_minmax(0,1fr)_auto] @7xl:[grid-template-areas:'profile_filters_rank']">
        <div className="flex min-w-0 flex-col gap-1 [grid-area:profile]">
          <PageHeader
            as={as}
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
                  {summary?.lastPlayedUnix != null ? (
                    <span> · last played {fromNow(summary.lastPlayedUnix)}</span>
                  ) : (
                    historyPending && (
                      <span aria-hidden="true" className="invisible">
                        {" "}
                        · last played a day ago
                      </span>
                    )
                  )}
                </span>
                <RefreshControl accountId={accountId} />
                {!isDemoAccount(accountId) && (
                  <Button variant="ghost" size="xs" asChild>
                    <Link to="/analytics/players/compare" search={{ players: accountId }}>
                      <GitCompareArrows aria-hidden="true" />
                      Compare
                    </Link>
                  </Button>
                )}
              </span>
            }
          />
          {(summary || historyPending) && (
            <section
              className={cn("flex flex-wrap gap-x-3 gap-y-1 text-xs", !summary && "invisible")}
              aria-label="Across all loaded match history"
              aria-hidden={!summary || undefined}
            >
              <InlineStat
                value={summary ? summary.matches.toLocaleString("en-US") : "0,000"}
                label="recorded matches"
              />
              <InlineStat value={summary ? formatPercent(summary.winrate) : "00.0%"} label="win rate" />
              <InlineStat value={summary ? formatPlaytime(summary.totalTimeS) : "000h 0m"} label="played" />
              {/* Visible, not only in the label: the filtered overview below shows different totals. */}
              <span className="text-muted-foreground">· all time</span>
            </section>
          )}
        </div>
        <div className="min-w-0 [grid-area:filters]">{children}</div>
        {rankPending && (
          // The loaded block's size: the 48px badge beside the rank and peak lines.
          <div
            aria-hidden="true"
            className="flex items-center gap-3 justify-self-start [grid-area:rank] sm:gap-2 sm:justify-self-end"
          >
            <Skeleton className="size-12" />
            <div className="flex flex-col items-center gap-1">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        )}
        {rank && rank.badge > 0 && (
          <div className="flex items-center gap-3 justify-self-start [grid-area:rank] sm:gap-2 sm:justify-self-end">
            <BadgeImage badge={rank.badge} ranks={ranks} className="size-12" />
            {badgeInfo && (
              <div className="text-center">
                <div className="text-sm font-semibold">
                  {badgeInfo.name} {badgeInfo.subtier}
                </div>
                {peak && (
                  <Tooltip content={`Reached ${toTime(peak.time).format("MMM D, YYYY")}`}>
                    <TooltipTarget className="text-xs whitespace-nowrap text-muted-foreground">
                      Peak {peak.name}
                    </TooltipTarget>
                  </Tooltip>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
