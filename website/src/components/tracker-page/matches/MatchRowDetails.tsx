import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { PlayerMatchHistoryEntry, Rank } from "deadlock_api_client";
import { Link2, UsersRound } from "lucide-react";
import { useMemo } from "react";

import { CopyButton } from "~/components/copy-button";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { useSteamProfiles } from "~/hooks/useSteamProfiles";
import {
  brawlRounds,
  formatMatchDuration,
  hasLanes,
  MATCH_MODE_LABELS_BY_ID,
  type TrackerSummary,
} from "~/lib/tracker/compute";
import { computeTeamContribution } from "~/lib/tracker/contribution";
import { computeFights } from "~/lib/tracker/fights";
import { computeLaneMatchup } from "~/lib/tracker/lane-matchup";
import { computeObjectiveEvents } from "~/lib/tracker/objectives";
import { computeSoulLead } from "~/lib/tracker/soul-lead";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";
import {
  type TrackerMatchPlayer,
  trackerMatchDeathsQueryOptions,
  trackerMatchMetadataQueryOptions,
} from "~/queries/tracker-queries";

import { BuildOrderStrip } from "./BuildOrderStrip";
import { KillsDeathsStrip } from "./KillsDeathsStrip";
import { LaneMatchupCard } from "./LaneMatchupCard";
import { PerformanceStrip } from "./PerformanceStrip";
import { Scoreboard, TEAMS } from "./Scoreboard";
import { SoulLeadChart } from "./SoulLeadChart";

export function MatchRowDetails({
  entry,
  accountId,
  ranks,
  heroSummary,
}: {
  entry: PlayerMatchHistoryEntry;
  accountId: number;
  ranks: Rank[];
  /** The player's summary on this match's hero over the filtered history. */
  heroSummary: TrackerSummary;
}) {
  const matchId = entry.match_id;
  // Street Brawl reports lane ids too, but its map has no lanes to speak of.
  const laned = hasLanes(entry);
  const rounds = brawlRounds(entry);
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
    <div className="@container space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {/* Restates the match table columns that collapse on narrow layouts. */}
        <span className="@3xl:hidden">
          {MATCH_MODE_LABELS_BY_ID[entry.match_mode] ?? "Unknown"} · {formatMatchDuration(entry.match_duration_s)}
        </span>
        {rounds && (
          <span className="tabular-nums">
            Rounds {rounds.own}–{rounds.enemy}
            {entry.brawl_avg_round_time_s != null &&
              entry.brawl_avg_round_time_s > 0 &&
              ` · ${formatMatchDuration(entry.brawl_avg_round_time_s)} avg round`}
          </span>
        )}
        <span className="inline-flex items-center gap-0.5 tabular-nums @5xl:hidden">
          Match {matchId}
          <CopyButton text={String(matchId)} iconOnly title="Copy match ID" className="size-6" />
        </span>
        <Link
          to="/team-builder"
          search={{ match: matchId }}
          className="inline-flex items-center gap-1 transition-colors hover:text-foreground @5xl:hidden"
        >
          <UsersRound className="size-3.5" />
          Team Builder
        </Link>
        <CopyButton
          text={() => {
            const url = new URL(window.location.href);
            url.searchParams.set("tab", "matches");
            url.searchParams.set("match", String(matchId));
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
