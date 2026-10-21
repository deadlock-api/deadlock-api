import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { PlayerMatchHistoryEntry, Rank } from "deadlock_api_client";
import { CircleDashed, Gavel, LogOut, RefreshCw, ShieldCheck, Trophy, UsersRound } from "lucide-react";
import { type ReactNode, useMemo, useRef, useState } from "react";

import { BadgeImage } from "~/components/domain/assets/BadgeImage";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { RankDelta } from "~/components/features/tracker/shared/RankDelta";
import { SaveMatchButton } from "~/components/features/tracker/shared/SaveMatchButton";
import { TrackerQueryPaused } from "~/components/features/tracker/shared/TrackerQueryPaused";
import { useTrackerTime } from "~/components/features/tracker/shared/useTrackerTime";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Button } from "~/components/ui/button";
import { CopyButton } from "~/components/ui/copy-button";
import { Heading, HeadingLevel, useNextHeadingLevel } from "~/components/ui/heading";
import { Spinner } from "~/components/ui/spinner";
import { Stat, StatGroup } from "~/components/ui/stat";
import { TextLink } from "~/components/ui/text-link";
import { useSteamProfiles } from "~/hooks/useSteamProfiles";
import { hasSoulEconomy } from "~/lib/game-mode";
import type { GameMode } from "~/lib/game-mode";
import { TONE_TEXT } from "~/lib/tone";
import {
  brawlRounds,
  entryGameMode,
  formatMatchDuration,
  hasLanes,
  type HeldRecord,
  isWin,
  matchModeLabel,
  type UnscoredOutcome,
  unscoredOutcome,
} from "~/lib/tracker/compute";
import { isDemoMatch } from "~/lib/tracker/demo";
import { computeFights } from "~/lib/tracker/fights";
import { computeLaneMatchups } from "~/lib/tracker/lane-matchup";
import { computeObjectiveEvents } from "~/lib/tracker/objectives";
import { computeSoulLead } from "~/lib/tracker/soul-lead";
import { NEUTRAL_SIDES, PLAYER_SIDES, TEAMS } from "~/lib/tracker/teams";
import { cn } from "~/lib/utils";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";
import type { MatchMetadataSource } from "~/queries/query-keys";
import {
  type TrackerMatchPlayer,
  trackerAbilitiesQueryOptions,
  trackerMatchMetadataQueryOptions,
} from "~/queries/tracker-queries";

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

/** What the match history row knows about the match, so it shows before the match details load. */
/** The tracker's link to a match: the page as filtered, with the match open. */
function trackerMatchLink(matchId: number) {
  const url = new URL(window.location.href);
  // nuqs batches URL writes; use the displayed match even if its URL is still catching up.
  url.searchParams.set("match", String(matchId));
  url.searchParams.delete("tab");
  return url.toString();
}

/** The line under a match's headline: mode, length, start, its ID and what can be done with it. */
function MatchMeta({
  matchId,
  modeLabel,
  durationS,
  brawlAvgRoundS,
  startTime,
  savedFor,
  matchLink,
}: {
  matchId: number;
  modeLabel: string;
  durationS: number;
  brawlAvgRoundS?: number | null;
  startTime: number;
  /** The tracked account the match can be saved for; a match seen on its own has none. */
  savedFor?: number;
  /** The URL "Copy match link" copies, read when clicked. */
  matchLink: () => string;
}) {
  const { toTime } = useTrackerTime();
  return (
    <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground tabular-nums">
      <span>
        {modeLabel} · {formatMatchDuration(durationS)}
        {brawlAvgRoundS != null && brawlAvgRoundS > 0 && ` (${formatMatchDuration(brawlAvgRoundS)} a round)`}
        {startTime > 0 && ` · ${toTime(startTime).format("ddd, MMM D, YYYY HH:mm")}`}
      </span>
      <span className="inline-flex items-center gap-0.5">
        Match {matchId}
        <CopyButton text={String(matchId)} size="icon-xs" title="Copy match ID" />
        {savedFor !== undefined && <SaveMatchButton accountId={savedFor} matchId={matchId} />}
      </span>
      <CopyButton variant="ghost" size="xs" icon={null} text={matchLink} title="Copy link to this match">
        Copy match link
      </CopyButton>
      {/* The Team Builder loads drafts from the API, which has never seen a generated demo match. */}
      {!isDemoMatch(matchId) && (
        <TextLink asChild tone="muted" underline="hover" className="inline-flex min-h-6 items-center gap-1">
          <Link to="/analytics/team-builder" search={{ match: matchId }}>
            <UsersRound className="size-3.5" />
            Team Builder
          </Link>
        </TextLink>
      )}
    </div>
  );
}

function MatchHeader({
  entry,
  accountId,
  ranks,
  heroName,
  records,
  matchLink,
}: {
  entry: PlayerMatchHistoryEntry;
  accountId: number;
  ranks: Rank[];
  heroName: string;
  records: HeldRecord[] | undefined;
  matchLink: () => string;
}) {
  const matchId = entry.match_id;
  const win = isWin(entry);
  const rounds = brawlRounds(entry);
  const unscored = unscoredOutcome(entry);
  const abandonedAtS = entry.abandoned_time_s ?? 0;
  const badge = entry.ranked_display_badge ?? 0;
  const ranked = badge > 0;
  const calibration = entry.ranked_calibration_match != null && entry.ranked_calibration_match !== 0;
  const demotionProtected = entry.ranked_used_demotion_protection === true;
  const headingLevel = useNextHeadingLevel();

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-64 flex-1 items-center gap-3">
          <HeroImage heroId={entry.hero_id} shape="circle" className="size-12 shrink-0" />
          <div className="flex min-w-0 flex-col gap-0.5 leading-tight">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <Heading as={headingLevel} size="lg">
                {heroName}
              </Heading>
              <span className={cn("text-sm font-bold", TONE_TEXT[win ? "positive" : "negative"])}>
                {win ? "Victory" : "Defeat"}
              </span>
              {rounds && (
                <span className="text-sm text-muted-foreground tabular-nums">
                  {rounds.own}–{rounds.enemy} rounds
                </span>
              )}
              <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 self-center text-xs text-muted-foreground">
                {records && (
                  <Note icon={Trophy} className="text-warning">
                    Personal best: {records.map((record) => `${record.label} ${record.value}`).join(" · ")}
                  </Note>
                )}
                {abandonedAtS > 0 && <Note icon={LogOut}>Abandoned at {formatMatchDuration(abandonedAtS)}</Note>}
                {unscored && (
                  <Note icon={UNSCORED_OUTCOME_NOTES[unscored].icon}>{UNSCORED_OUTCOME_NOTES[unscored].text}</Note>
                )}
                {demotionProtected && <Note icon={ShieldCheck}>Demotion protection prevented a rank drop</Note>}
                {calibration && <Note icon={CircleDashed}>Calibration match</Note>}
              </span>
            </div>
            <MatchMeta
              matchId={matchId}
              modeLabel={matchModeLabel(entry)}
              durationS={entry.match_duration_s}
              brawlAvgRoundS={entry.brawl_avg_round_time_s}
              startTime={entry.start_time}
              savedFor={accountId}
              matchLink={matchLink}
            />
          </div>
        </div>
        <StatGroup variant="plain" size="xs" className="ms-auto auto-cols-max grid-flow-col gap-4 @sm:gap-6">
          <Stat
            align="end"
            label="K / D / A"
            value={`${entry.player_kills} / ${entry.player_deaths} / ${entry.player_assists}`}
          />
          {hasSoulEconomy(entryGameMode(entry)) && (
            <Stat align="end" label="Souls" value={entry.net_worth.toLocaleString("en-US")} />
          )}
          {(ranked || (entry.ranked_delta != null && entry.ranked_delta !== 0)) && (
            <Stat
              align="end"
              label="Rank"
              value={
                <span className="inline-flex items-center gap-1.5">
                  {ranked && <BadgeImage badge={badge} ranks={ranks} size="inline" />}
                  <RankDelta value={entry.ranked_delta} className="text-sm" />
                </span>
              }
            />
          )}
        </StatGroup>
      </div>
    </div>
  );
}

interface MatchViewProps {
  matchId: number;
  durationS: number;
  gameMode: GameMode;
  ranks: Rank[];
  /**
   * The player the match is seen through: their team is "Your team", their row stands out and their lane is compared.
   * Absent, the match is seen on its own, from the Hidden King's side with both teams named.
   */
  accountId?: number;
  /** The tracked player's side as their history knows it (0 or 1), for when the metadata lacks them. */
  playerTeam?: number;
  /** Whether the map had lanes; by default every normal-mode match. */
  laned?: boolean;
  /** `graphql` shows only stored matches and never asks Steam for one. */
  source?: MatchMetadataSource;
  /** Says what to do when the match has no details yet. */
  unavailable?: ReactNode;
}

/** One match: the timeline, the scoreboard and the lanes, seen through a tracked player or on its own. */
export function MatchView({
  matchId,
  durationS,
  gameMode,
  ranks,
  accountId,
  playerTeam,
  // Street Brawl reports lane ids too, but its map has no lanes to speak of.
  laned = gameMode === "normal",
  source = "any",
  unavailable,
}: MatchViewProps) {
  // Street Brawl grants fixed souls each round: no soul lead, no soul columns.
  const soulEconomy = hasSoulEconomy(gameMode);
  const {
    data: match,
    isPending,
    isError,
    isFetching,
    fetchStatus,
    refetch,
  } = useQuery(trackerMatchMetadataQueryOptions(matchId, source));
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
  // A player who was not in the match (and whose side no history names) has no side to see it from.
  const neutral = accountId === undefined || (match != null && !tracked && playerTeam === undefined);
  const sides = neutral ? NEUTRAL_SIDES : PLAYER_SIDES;
  // The history entry knows the side even when the metadata lacks the player (partial ingestion); guessing Team0
  // would invert the soul lead and the objectives for a player on the other side.
  const ownTeam = tracked?.team ?? TEAMS[playerTeam === 1 ? 1 : 0].key;

  const soulLead = useMemo(
    () => (match && soulEconomy ? computeSoulLead(match.players, ownTeam) : null),
    [match, ownTeam, soulEconomy],
  );
  const objectiveEvents = useMemo(() => (match ? computeObjectiveEvents(match, ownTeam) : []), [match, ownTeam]);

  const laneMatchups = useMemo(
    () => (laned && match ? computeLaneMatchups(match.players, neutral ? undefined : accountId) : []),
    [laned, match, accountId, neutral],
  );
  // The player the timeline plots and the scoreboard marks: the tracked player, or, seen on its own, the match's MVP
  // until another one is picked.
  const [pickedAccountId, setViewedAccountId] = useState(accountId);
  const mvpAccountId = match?.players.find((player) => player.mvp_rank === 1)?.account_id;
  const viewedAccountId = pickedAccountId ?? (neutral ? mvpAccountId : undefined);
  const fights = useMemo(
    () =>
      match && viewedAccountId !== undefined
        ? computeFights(match.deaths, match.players, viewedAccountId, durationS)
        : null,
    [match, viewedAccountId, durationS],
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
  if (isPending) return <LoadingState label="match details" />;

  const checkAgain = (
    <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
      {isFetching ? <Spinner label="Checking" /> : <RefreshCw data-icon="inline-start" />}
      {isFetching ? "Checking…" : "Check again"}
    </Button>
  );
  if (isError && !match) {
    if (neutral) {
      return (
        <ErrorState
          title="Could not load the match"
          description="Try again in a moment."
          onRetry={() => refetch()}
          retrying={isFetching}
        />
      );
    }
    return (
      <EmptyState
        title="Match details are still being processed"
        description="We are collecting the data for this account. It can take up to 30 minutes for all matches to appear."
        action={checkAgain}
      />
    );
  }

  if (!match) {
    if (unavailable) return unavailable;
    return (
      <EmptyState
        title="Match details unavailable"
        description="These details may not have been collected yet. You can check again."
        action={checkAgain}
      />
    );
  }

  const missingBuildAssets = [itemsQuery, abilitiesQuery].filter((query) => query.data == null);
  return (
    // The container the scoreboard's two team columns and the lane cards query, wherever the view is placed.
    <div className="@container flex flex-col gap-4">
      {fetchStatus === "paused" ? (
        <TrackerQueryPaused description="Showing loaded match details. Refresh resumes when you're back online." />
      ) : isError ? (
        <ErrorState
          title="Could not refresh match details"
          description="Showing the last loaded details. Try again to refresh them."
          onRetry={() => refetch()}
          retrying={isFetching}
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
        durationS={durationS}
        nameOf={nameOf}
        sides={sides}
      />
      {missingBuildAssets.some((query) => query.fetchStatus === "paused") ? (
        <TrackerQueryPaused description="Build details will load automatically when you're back online." />
      ) : missingBuildAssets.some((query) => query.isError) ? (
        <ErrorState
          title="Could not load build details"
          description="Match stats are available. Try again to load the complete build."
          onRetry={() => {
            for (const query of missingBuildAssets) {
              if (query.isError) void query.refetch();
            }
          }}
          retrying={missingBuildAssets.some((query) => query.isFetching)}
        />
      ) : null}
      <Scoreboard
        match={match}
        accountId={accountId}
        ranks={ranks}
        laned={laned}
        gameMode={gameMode}
        durationS={durationS}
        itemsById={itemsQuery.data}
        abilitiesById={abilitiesQuery.data}
        nameOf={nameOf}
        viewedAccountId={viewedAccountId ?? null}
        onViewPlayer={viewPlayer}
      />
      {laneMatchups.length > 0 && (
        <LanesCard matchups={laneMatchups} trackedAccountId={neutral ? undefined : accountId} nameOf={nameOf} />
      )}
    </div>
  );
}

export function MatchDetails({
  entry,
  accountId,
  ranks,
  heroName,
  records,
  matchLink = () => trackerMatchLink(entry.match_id),
  source,
  unavailable,
}: {
  entry: PlayerMatchHistoryEntry;
  accountId: number;
  ranks: Rank[];
  heroName: string;
  /** Personal bests this match holds over the filtered history. */
  records: HeldRecord[] | undefined;
  /** What "Copy match link" copies; by default the tracker with this match open. */
  matchLink?: () => string;
  source?: MatchMetadataSource;
  unavailable?: ReactNode;
}) {
  const headingLevel = useNextHeadingLevel();
  return (
    <div className="@container flex flex-col gap-4">
      <MatchHeader
        entry={entry}
        accountId={accountId}
        ranks={ranks}
        heroName={heroName}
        records={records}
        matchLink={matchLink}
      />
      {/* The header titles the match, so the timeline, the teams and the lanes are titled one level below it. */}
      <HeadingLevel level={Number(headingLevel.slice(1))}>
        {/* A new match or player starts over: the picked player must not carry over from the last one. */}
        <MatchView
          key={`${entry.match_id}-${accountId}`}
          matchId={entry.match_id}
          durationS={entry.match_duration_s}
          gameMode={entryGameMode(entry)}
          laned={hasLanes(entry)}
          ranks={ranks}
          accountId={accountId}
          playerTeam={entry.player_team}
          source={source}
          unavailable={unavailable}
        />
      </HeadingLevel>
    </div>
  );
}

/**
 * A match seen on its own, in the tracker's layout: which team won (Street Brawl's rounds too), each team's average
 * rank and the match's meta line, then the match itself from the Hidden King's side.
 */
export function NeutralMatchDetails({
  matchId,
  ranks,
  durationS,
  gameMode,
  laned,
  modeLabel,
  startTime,
  winningTeam,
  averageBadges,
  teamScore,
  brawlAvgRoundS,
  matchLink,
  unavailable,
}: {
  matchId: number;
  ranks: Rank[];
  durationS: number;
  gameMode: GameMode;
  laned: boolean;
  modeLabel: string;
  startTime: number;
  /** "Team0" or "Team1". */
  winningTeam: string;
  /** Each team's average badge, Team0 first; null for a team without one. */
  averageBadges: [number | null, number | null];
  /** Street Brawl's round score, Team0 first. */
  teamScore: [number, number] | null;
  brawlAvgRoundS: number | null;
  matchLink: () => string;
  unavailable?: ReactNode;
}) {
  const winner = TEAMS.find((team) => team.key === winningTeam);
  // "The Archmother won 3–2 rounds": the winner's rounds first, as the heading names the winner.
  const rounds = teamScore && winningTeam === TEAMS[1].key ? [teamScore[1], teamScore[0]] : teamScore;
  const headingLevel = useNextHeadingLevel();
  return (
    <div className="@container flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-64 flex-1 flex-col gap-0.5 leading-tight">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <Heading as={headingLevel} size="lg">
              {winner ? `${winner.name} won` : "Match"}
            </Heading>
            {rounds && (
              <span className="text-sm text-muted-foreground tabular-nums">
                {rounds[0]}–{rounds[1]} rounds
              </span>
            )}
          </div>
          <MatchMeta
            matchId={matchId}
            modeLabel={modeLabel}
            durationS={durationS}
            brawlAvgRoundS={brawlAvgRoundS}
            startTime={startTime}
            matchLink={matchLink}
          />
        </div>
        {averageBadges.some((badge) => badge != null) && (
          <StatGroup variant="plain" size="xs" className="ms-auto auto-cols-max grid-flow-col gap-4 @sm:gap-6">
            {TEAMS.map((team, index) => {
              const badge = averageBadges[index];
              return (
                badge != null && (
                  <Stat
                    key={team.key}
                    align="end"
                    label={team.name}
                    value={<BadgeImage badge={badge} ranks={ranks} size="inline" />}
                  />
                )
              );
            })}
          </StatGroup>
        )}
      </div>
      <HeadingLevel level={Number(headingLevel.slice(1))}>
        <MatchView
          key={matchId}
          matchId={matchId}
          durationS={durationS}
          gameMode={gameMode}
          laned={laned}
          ranks={ranks}
          source="graphql"
          unavailable={unavailable}
        />
      </HeadingLevel>
    </div>
  );
}
