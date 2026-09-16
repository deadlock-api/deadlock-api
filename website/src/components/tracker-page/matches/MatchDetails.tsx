import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { PlayerMatchHistoryEntry, Rank } from "deadlock_api_client";
import { CircleDashed, Gavel, Link2, LogOut, RefreshCw, ShieldCheck, Trophy, UsersRound } from "lucide-react";
import { type ReactNode, useMemo, useRef, useState } from "react";

import { BadgeImage } from "~/components/BadgeImage";
import { CopyButton } from "~/components/copy-button";
import { HeroImage } from "~/components/HeroImage";
import { LoadingLogo } from "~/components/LoadingLogo";
import { Button } from "~/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "~/components/ui/empty";
import { day } from "~/dayjs";
import { useSteamProfiles } from "~/hooks/useSteamProfiles";
import {
  brawlRounds,
  formatMatchDuration,
  hasLanes,
  type HeldRecord,
  isWin,
  matchModeLabel,
  type UnscoredOutcome,
  unscoredOutcome,
} from "~/lib/tracker/compute";
import { computeFights } from "~/lib/tracker/fights";
import { computeLaneMatchups } from "~/lib/tracker/lane-matchup";
import { computeObjectiveEvents } from "~/lib/tracker/objectives";
import { computeSoulLead } from "~/lib/tracker/soul-lead";
import { TEAMS } from "~/lib/tracker/teams";
import { cn } from "~/lib/utils";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";
import {
  type TrackerMatchPlayer,
  trackerAbilitiesQueryOptions,
  trackerMatchMetadataQueryOptions,
} from "~/queries/tracker-queries";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";
import { RankDelta } from "../shared/RankDelta";
import { SaveMatchButton } from "../shared/SaveMatchButton";
import { TrackerQueryError } from "../shared/TrackerQueryError";
import { TrackerQueryPaused } from "../shared/TrackerQueryPaused";
import { LanesCard } from "./LanesCard";
import { MatchTimeline } from "./MatchTimeline";
import { Scoreboard } from "./Scoreboard";

const UNSCORED_OUTCOME_NOTES: Record<UnscoredOutcome, { icon: typeof Gavel; text: string }> = {
  penalized: { icon: Gavel, text: "Penalized for this match" },
  party_penalized: { icon: Gavel, text: "Penalized with the party for this match" },
  not_scored: { icon: CircleDashed, text: "This match did not count" },
};

function Note({ icon: Icon, className, children }: { icon: typeof Gavel; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <Icon className="size-3.5 shrink-0" />
      {children}
    </span>
  );
}

function HeaderStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="leading-tight">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-center justify-end gap-1.5 text-base font-semibold tabular-nums">{children}</div>
    </div>
  );
}

/** What the match history row knows about the match, so it shows before the match details load. */
function MatchHeader({
  entry,
  accountId,
  ranks,
  heroName,
  records,
}: {
  entry: PlayerMatchHistoryEntry;
  accountId: number;
  ranks: Rank[];
  heroName: string;
  records: HeldRecord[] | undefined;
}) {
  const matchId = entry.match_id;
  const win = isWin(entry);
  const rounds = brawlRounds(entry);
  const unscored = unscoredOutcome(entry);
  const abandoned = entry.abandoned_time_s != null && entry.abandoned_time_s > 0;
  const ranked = entry.ranked_display_badge != null && entry.ranked_display_badge > 0;
  const calibration = entry.ranked_calibration_match != null && entry.ranked_calibration_match !== 0;
  const demotionProtected = entry.ranked_used_demotion_protection === true;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-[16rem] flex-1 items-center gap-3">
          <HeroImage heroId={entry.hero_id} className="size-12 shrink-0 rounded-full" />
          <div className="min-w-0 leading-tight">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-lg font-semibold">{heroName}</span>
              <span className={cn("text-sm font-bold", win ? WIN_TEXT_CLASS : LOSS_TEXT_CLASS)}>
                {win ? "Victory" : "Defeat"}
              </span>
              {rounds && (
                <span className="text-sm text-muted-foreground tabular-nums">
                  {rounds.own}–{rounds.enemy} rounds
                </span>
              )}
              <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 self-center text-xs text-muted-foreground">
                {records && (
                  <Note icon={Trophy} className="text-amber-500">
                    Personal best: {records.map((record) => `${record.label} ${record.value}`).join(" · ")}
                  </Note>
                )}
                {abandoned && (
                  <Note icon={LogOut}>Abandoned at {formatMatchDuration(entry.abandoned_time_s as number)}</Note>
                )}
                {unscored && (
                  <Note icon={UNSCORED_OUTCOME_NOTES[unscored].icon}>{UNSCORED_OUTCOME_NOTES[unscored].text}</Note>
                )}
                {demotionProtected && <Note icon={ShieldCheck}>Demotion protection prevented a rank drop</Note>}
                {calibration && <Note icon={CircleDashed}>Calibration match</Note>}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground tabular-nums">
              <span>
                {matchModeLabel(entry)} · {formatMatchDuration(entry.match_duration_s)}
                {entry.brawl_avg_round_time_s != null &&
                  entry.brawl_avg_round_time_s > 0 &&
                  ` (${formatMatchDuration(entry.brawl_avg_round_time_s)} a round)`}{" "}
                · {day.unix(entry.start_time).format("ddd, MMM D, YYYY HH:mm")}
              </span>
              <span className="inline-flex items-center gap-0.5">
                Match {matchId}
                <CopyButton text={String(matchId)} iconOnly title="Copy match ID" className="size-6" />
                <SaveMatchButton accountId={accountId} matchId={matchId} />
              </span>
              <CopyButton
                variant="ghost"
                size="xs"
                text={() => {
                  const url = new URL(window.location.href);
                  // nuqs batches URL writes; use the displayed match even if its URL is still catching up.
                  url.searchParams.set("match", String(matchId));
                  url.searchParams.delete("tab");
                  return url.toString();
                }}
                title="Copy link to this match with your current filters"
              >
                <Link2 data-icon="inline-start" />
                Copy match link
              </CopyButton>
              <Link
                to="/analytics/team-builder"
                search={{ match: matchId }}
                className="inline-flex min-h-6 items-center gap-1 transition-colors hover:text-foreground"
              >
                <UsersRound className="size-3.5" />
                Team Builder
              </Link>
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-end gap-4 text-right @sm:gap-6">
          <HeaderStat label="K / D / A">
            {entry.player_kills} / {entry.player_deaths} / {entry.player_assists}
          </HeaderStat>
          <HeaderStat label="Souls">{entry.net_worth.toLocaleString("en-US")}</HeaderStat>
          {(ranked || (entry.ranked_delta != null && entry.ranked_delta !== 0)) && (
            <HeaderStat label="Rank">
              {ranked && (
                <BadgeImage badge={entry.ranked_display_badge as number} ranks={ranks} className="size-6 max-w-none" />
              )}
              <RankDelta value={entry.ranked_delta} className="text-sm" />
            </HeaderStat>
          )}
        </div>
      </div>
    </div>
  );
}

function MatchBody({ entry, accountId, ranks }: { entry: PlayerMatchHistoryEntry; accountId: number; ranks: Rank[] }) {
  const matchId = entry.match_id;
  // Street Brawl reports lane ids too, but its map has no lanes to speak of.
  const laned = hasLanes(entry);
  const {
    data: match,
    isPending,
    isError,
    isFetching,
    fetchStatus,
    refetch,
  } = useQuery(trackerMatchMetadataQueryOptions(matchId));
  const itemsQuery = useQuery({
    ...itemUpgradesQueryOptions,
    select: (items) => new Map(items.map((item) => [item.id, item])),
  });
  const abilitiesQuery = useQuery({
    ...trackerAbilitiesQueryOptions,
    enabled: match != null,
    select: (abilities) => new Map(abilities.map((ability) => [ability.id, ability])),
  });

  const unnamedAccountIds = useMemo(
    () => match?.players.filter((player) => !player.personaname).map((player) => player.account_id) ?? [],
    [match],
  );
  const { profiles } = useSteamProfiles(unnamedAccountIds);

  const tracked = match?.players.find((player) => player.account_id === accountId);
  const ownTeam = tracked?.team ?? TEAMS[0].key;

  const soulLead = useMemo(() => (match ? computeSoulLead(match.players, ownTeam) : null), [match, ownTeam]);
  const objectiveEvents = useMemo(() => (match ? computeObjectiveEvents(match, ownTeam) : []), [match, ownTeam]);

  const laneMatchups = useMemo(
    () => (laned && match ? computeLaneMatchups(match.players, accountId) : []),
    [laned, match, accountId],
  );
  const [viewedAccountId, setViewedAccountId] = useState(accountId);
  const fights = useMemo(
    () => (match ? computeFights(match.deaths, match.players, viewedAccountId, entry.match_duration_s) : null),
    [match, viewedAccountId, entry.match_duration_s],
  );
  const viewedPlayer = match?.players.find((player) => player.account_id === viewedAccountId);
  const timelineRef = useRef<HTMLElement>(null);
  const viewPlayer = (playerAccountId: number) => {
    setViewedAccountId(playerAccountId);
    // The scoreboard sits below the timeline, which would otherwise change out of sight.
    const timeline = timelineRef.current;
    if (timeline && timeline.getBoundingClientRect().top < 0) {
      timeline.scrollIntoView({ block: "start" });
      timeline.focus({ preventScroll: true });
    }
  };

  const nameOf = (player: TrackerMatchPlayer) =>
    player.personaname ?? profiles[player.account_id]?.personaname ?? `Player ${player.account_id}`;

  if (fetchStatus === "paused" && !match) {
    return <TrackerQueryPaused description="Match details will load automatically when you're back online." />;
  }
  if (isPending) return <LoadingLogo />;

  if (isError && !match) {
    return (
      <TrackerQueryError
        title="Could not load match details"
        description="The request failed. Try loading this match again."
        onRetry={() => refetch()}
        isRetrying={isFetching}
      />
    );
  }

  if (!match) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Match details unavailable</EmptyTitle>
          <EmptyDescription>These details may not have been collected yet. You can check again.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw data-icon="inline-start" className={cn(isFetching && "animate-spin")} />
            {isFetching ? "Checking…" : "Check again"}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const missingBuildAssets = [itemsQuery, abilitiesQuery].filter((query) => query.data == null);
  return (
    <div className="flex flex-col gap-4">
      {fetchStatus === "paused" ? (
        <TrackerQueryPaused description="Showing loaded match details. Refresh resumes when you're back online." />
      ) : isError ? (
        <TrackerQueryError
          title="Could not refresh match details"
          description="Showing the last loaded details. Try again to refresh them."
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      ) : null}
      <MatchTimeline
        ref={timelineRef}
        lead={soulLead}
        objectives={objectiveEvents}
        fights={fights}
        viewed={viewedPlayer}
        players={match.players}
        onViewPlayer={viewPlayer}
        viewedIsAlly={viewedPlayer?.team === ownTeam}
        durationS={entry.match_duration_s}
        nameOf={nameOf}
      />
      {missingBuildAssets.some((query) => query.fetchStatus === "paused") ? (
        <TrackerQueryPaused description="Build details will load automatically when you're back online." />
      ) : missingBuildAssets.some((query) => query.isError) ? (
        <TrackerQueryError
          title="Could not load build details"
          description="Match stats are available. Try again to load the complete build."
          onRetry={() => {
            for (const query of missingBuildAssets) {
              if (query.isError) void query.refetch();
            }
          }}
          isRetrying={missingBuildAssets.some((query) => query.isFetching)}
        />
      ) : null}
      <Scoreboard
        match={match}
        accountId={accountId}
        ranks={ranks}
        laned={laned}
        durationS={entry.match_duration_s}
        itemsById={itemsQuery.data}
        abilitiesById={abilitiesQuery.data}
        nameOf={nameOf}
        viewedAccountId={viewedAccountId}
        onViewPlayer={viewPlayer}
      />
      {laneMatchups.length > 0 && <LanesCard matchups={laneMatchups} trackedAccountId={accountId} nameOf={nameOf} />}
    </div>
  );
}

export function MatchDetails({
  entry,
  accountId,
  ranks,
  heroName,
  records,
}: {
  entry: PlayerMatchHistoryEntry;
  accountId: number;
  ranks: Rank[];
  heroName: string;
  /** Personal bests this match holds over the filtered history. */
  records: HeldRecord[] | undefined;
}) {
  return (
    <div className="@container space-y-4">
      <MatchHeader entry={entry} accountId={accountId} ranks={ranks} heroName={heroName} records={records} />
      <MatchBody entry={entry} accountId={accountId} ranks={ranks} />
    </div>
  );
}
