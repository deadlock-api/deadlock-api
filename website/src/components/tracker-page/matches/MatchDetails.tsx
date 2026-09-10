import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { PlayerMatchHistoryEntry, Rank } from "deadlock_api_client";
import { CircleDashed, Filter, FilterX, Gavel, Link2, LogOut, ShieldCheck, Trophy, UsersRound } from "lucide-react";
import { type ReactNode, useMemo } from "react";

import { BadgeImage } from "~/components/BadgeImage";
import { CopyButton } from "~/components/copy-button";
import { HeroImage } from "~/components/HeroImage";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { day } from "~/dayjs";
import { useDateRangeState } from "~/hooks/useDateRangeState";
import { useSteamProfiles } from "~/hooks/useSteamProfiles";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import {
  brawlRounds,
  formatMatchDuration,
  hasLanes,
  type HeldRecord,
  isWin,
  matchModeLabel,
  type TrackerSummary,
  type UnscoredOutcome,
  unscoredOutcome,
} from "~/lib/tracker/compute";
import { computeTeamContribution } from "~/lib/tracker/contribution";
import { computeFights } from "~/lib/tracker/fights";
import { computeLaneMatchup } from "~/lib/tracker/lane-matchup";
import { computeObjectiveEvents } from "~/lib/tracker/objectives";
import { computeSoulLead } from "~/lib/tracker/soul-lead";
import { cn } from "~/lib/utils";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";
import {
  type TrackerMatchPlayer,
  trackerMatchDeathsQueryOptions,
  trackerMatchMetadataQueryOptions,
} from "~/queries/tracker-queries";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";
import { RankDelta } from "../shared/RankDelta";
import { BuildOrderStrip } from "./BuildOrderStrip";
import { KillsDeathsStrip } from "./KillsDeathsStrip";
import { LaneMatchupCard } from "./LaneMatchupCard";
import { PerformanceStrip } from "./PerformanceStrip";
import { Scoreboard, TEAMS } from "./Scoreboard";
import { SoulLeadChart } from "./SoulLeadChart";

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
  ranks,
  heroName,
  heroSummary,
  records,
  heroFiltered,
  onToggleHeroFilter,
}: {
  entry: PlayerMatchHistoryEntry;
  ranks: Rank[];
  heroName: string;
  heroSummary: TrackerSummary;
  records: HeldRecord[] | undefined;
  heroFiltered: boolean;
  onToggleHeroFilter: () => void;
}) {
  const matchId = entry.match_id;
  const win = isWin(entry);
  const rounds = brawlRounds(entry);
  const unscored = unscoredOutcome(entry);
  const abandoned = entry.abandoned_time_s != null && entry.abandoned_time_s > 0;
  const ranked = entry.ranked_display_badge != null && entry.ranked_display_badge > 0;
  const calibration = entry.ranked_calibration_match != null && entry.ranked_calibration_match !== 0;
  const demotionProtected = entry.ranked_used_demotion_protection === true;
  const { startDate, endDate } = useDateRangeState();

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
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
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              {matchModeLabel(entry)} · {formatMatchDuration(entry.match_duration_s)}
              {entry.brawl_avg_round_time_s != null &&
                entry.brawl_avg_round_time_s > 0 &&
                ` (${formatMatchDuration(entry.brawl_avg_round_time_s)} a round)`}{" "}
              · {day.unix(entry.start_time).format("ddd, MMM D, YYYY HH:mm")}
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-end gap-6 text-right">
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
      {(abandoned || unscored || records || demotionProtected || calibration) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {records && (
            <Note icon={Trophy} className="text-amber-500">
              Personal best: {records.map((record) => `${record.label} ${record.value}`).join(" · ")}
            </Note>
          )}
          {abandoned && <Note icon={LogOut}>Abandoned at {formatMatchDuration(entry.abandoned_time_s as number)}</Note>}
          {unscored && (
            <Note icon={UNSCORED_OUTCOME_NOTES[unscored].icon}>{UNSCORED_OUTCOME_NOTES[unscored].text}</Note>
          )}
          {demotionProtected && <Note icon={ShieldCheck}>Demotion protection prevented a rank drop</Note>}
          {calibration && <Note icon={CircleDashed}>Calibration match</Note>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={onToggleHeroFilter}
          className="inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground"
          title={
            heroFiltered
              ? undefined
              : `${heroSummary.wins}W – ${heroSummary.losses}L · ${Math.round(heroSummary.winrate * 100)}% on ${heroName}`
          }
        >
          {heroFiltered ? <FilterX className="size-3.5" /> : <Filter className="size-3.5" />}
          {heroFiltered ? "Show all heroes" : `Only ${heroName} matches`}
        </button>
        <span className="inline-flex items-center gap-0.5 tabular-nums">
          Match {matchId}
          <CopyButton text={String(matchId)} iconOnly title="Copy match ID" className="size-6" />
        </span>
        <Link
          to="/team-builder"
          search={{ match: matchId }}
          className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
        >
          <UsersRound className="size-3.5" />
          Team Builder
        </Link>
        <CopyButton
          text={() => {
            const url = new URL(window.location.href);
            url.searchParams.set("tab", "matches");
            url.searchParams.set("match", String(matchId));
            // The default range follows the current season, which would drop the match once the next one starts.
            url.searchParams.set("date_range", parseAsDayjsRange.serialize([startDate, endDate]));
            return url.toString();
          }}
          variant="ghost"
          size="sm"
          className="ml-auto h-6 gap-1 px-2 text-xs text-muted-foreground"
          title="Copy a link that opens this match"
        >
          <Link2 className="size-3.5" />
          Copy link
        </CopyButton>
      </div>
    </div>
  );
}

function MatchBody({
  entry,
  accountId,
  ranks,
  heroSummary,
}: {
  entry: PlayerMatchHistoryEntry;
  accountId: number;
  ranks: Rank[];
  heroSummary: TrackerSummary;
}) {
  const matchId = entry.match_id;
  // Street Brawl reports lane ids too, but its map has no lanes to speak of.
  const laned = hasLanes(entry);
  const { data: match, isPending, isError, refetch } = useQuery(trackerMatchMetadataQueryOptions(matchId));
  const { data: deathRows } = useQuery(trackerMatchDeathsQueryOptions(matchId));
  const { data: itemsById } = useQuery({
    ...itemUpgradesQueryOptions,
    select: (items) => new Map(items.map((item) => [item.id, item])),
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

  const laneMatchup = useMemo(
    () => (laned && match ? computeLaneMatchup(match.players, accountId) : null),
    [laned, match, accountId],
  );
  const contribution = useMemo(
    () => (match ? computeTeamContribution(match.players, accountId) : null),
    [match, accountId],
  );
  const fights = useMemo(
    () => (match && deathRows ? computeFights(deathRows, match.players, accountId) : null),
    [match, deathRows, accountId],
  );

  const nameOf = (player: TrackerMatchPlayer) =>
    player.personaname ?? profiles[player.account_id]?.personaname ?? `Player ${player.account_id}`;

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[160px] w-full" />
        <div className="grid gap-4 sm:grid-cols-2">
          {TEAMS.map((team) => (
            <div key={team.key} className="space-y-2">
              <Skeleton className="h-5 w-40" />
              {Array.from({ length: 6 }, (_, i) => (
                // oxlint-disable-next-line react/no-array-index-key
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-sm text-muted-foreground">
        Failed to load match details.
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground">No details are available for this match.</div>
    );
  }

  return (
    <div className="space-y-4">
      {soulLead && <SoulLeadChart lead={soulLead} events={objectiveEvents} />}
      {contribution && tracked && (
        <PerformanceStrip entry={entry} player={tracked} contribution={contribution} heroSummary={heroSummary} />
      )}
      {laneMatchup && <LaneMatchupCard matchup={laneMatchup} trackedAccountId={accountId} nameOf={nameOf} />}
      {fights && <KillsDeathsStrip fights={fights} matchDurationS={entry.match_duration_s} nameOf={nameOf} />}
      <Scoreboard
        match={match}
        accountId={accountId}
        ranks={ranks}
        laned={laned}
        itemsById={itemsById}
        nameOf={nameOf}
      />
      {tracked && itemsById && <BuildOrderStrip items={tracked.items} itemsById={itemsById} />}
    </div>
  );
}

export function MatchDetails({
  entry,
  accountId,
  ranks,
  heroName,
  heroSummary,
  records,
  heroFiltered,
  onToggleHeroFilter,
}: {
  entry: PlayerMatchHistoryEntry;
  accountId: number;
  ranks: Rank[];
  heroName: string;
  /** The player's summary on this match's hero over the filtered history. */
  heroSummary: TrackerSummary;
  /** Personal bests this match holds over the filtered history. */
  records: HeldRecord[] | undefined;
  /** Whether the history is already narrowed to a hero. */
  heroFiltered: boolean;
  onToggleHeroFilter: () => void;
}) {
  return (
    <div className="@container space-y-4">
      <MatchHeader
        entry={entry}
        ranks={ranks}
        heroName={heroName}
        heroSummary={heroSummary}
        records={records}
        heroFiltered={heroFiltered}
        onToggleHeroFilter={onToggleHeroFilter}
      />
      <MatchBody entry={entry} accountId={accountId} ranks={ranks} heroSummary={heroSummary} />
    </div>
  );
}
