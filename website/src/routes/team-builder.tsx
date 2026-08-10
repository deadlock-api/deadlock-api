import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { AnalyticsApiHeroCountersStatsRequest } from "deadlock_api_client";
import { DicesIcon, SearchIcon, TriangleAlertIcon, UsersRoundIcon } from "lucide-react";
import { parseAsBoolean, parseAsInteger, useQueryState } from "nuqs";
import { useCallback, useMemo, useState } from "react";

import { Filter } from "~/components/Filter";
import { formatDateRange } from "~/components/Filter/utils";
import { combineQueryStates } from "~/components/QueryRenderer";
import { MATCH_MODE_LABELS, parseAsMatchMode } from "~/components/selectors/MatchModeSelector";
import { CounterMatrix } from "~/components/team-builder/CounterMatrix";
import { DetailDialog } from "~/components/team-builder/DetailDialog";
import { DraftBoard } from "~/components/team-builder/DraftBoard";
import { HeroPickerDialog, type PickerTarget } from "~/components/team-builder/HeroPickerDialog";
import { LaneCards } from "~/components/team-builder/LaneCards";
import { LaneDetailBody } from "~/components/team-builder/LaneDetailDialog";
import { MatchImportControl } from "~/components/team-builder/MatchImportControl";
import { NextPickPanel } from "~/components/team-builder/NextPickPanel";
import { PairDetailBody } from "~/components/team-builder/PairDetailDialog";
import { PairsPanel } from "~/components/team-builder/PairsPanel";
import { Panel } from "~/components/team-builder/Panel";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { useDateRangeState } from "~/hooks/useDateRangeState";
import { useDraft } from "~/hooks/useDraft";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { seo } from "~/lib/seo";
import {
  analyzeDraft,
  filled,
  type LaneRow,
  type PairRow,
  recommendPicks,
  type Side,
  StatsIndex,
  type Swap,
  suggestLaneAssignment,
  suggestSwaps,
} from "~/lib/team-builder/analysis";
import { TEAM_SIZE } from "~/lib/team-builder/lanes";
import { filterPlayableHeroes, heroesQueryOptions } from "~/queries/asset-queries";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";
import { laneMatchupStatsQueryOptions } from "~/queries/lane-matchup-query";
import { type ImportedMatch, matchMetadataQueryOptions, parseImportedMatch } from "~/queries/match-import-query";
import { draftCounterStatsQueryOptions, draftSynergyStatsQueryOptions } from "~/queries/team-builder-queries";

const DEFAULT_MIN_RANK = 91;
const DEFAULT_MAX_RANK = 116;

export const Route = createFileRoute("/team-builder")({
  component: TeamBuilderPage,
  head: () =>
    seo({
      title: "Deadlock Team Builder: Draft a 6v6 and Read the Win Rate",
      description:
        "Draft a full Deadlock 6v6, assign the three lanes, and see the predicted win rate broken down into lane matchups, pair synergy, counter picks and solo hero strength.",
      path: "/team-builder",
    }),
});

function TeamBuilderPage() {
  const queryClient = useQueryClient();
  const [importedMatchId, setImportedMatchId] = useQueryState("match", parseAsInteger);
  const [sidesSwapped, setSidesSwapped] = useQueryState("swap", parseAsBoolean.withDefault(false));
  // Editing any slot means the board no longer mirrors the imported match, so the reference is dropped
  // rather than left pointing at a draft it does not describe. `loadMatch` re-sets it afterwards.
  const forgetImport = useCallback(() => {
    void setImportedMatchId(null);
    void setSidesSwapped(null);
  }, [setImportedMatchId, setSidesSwapped]);
  const controls = useDraft(forgetImport);
  const { draft, setSlot, setSide, clearAll, nextOpenSlot } = controls;

  const [matchMode, setMatchMode] = useQueryState("match_mode", parseAsMatchMode);
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(DEFAULT_MIN_RANK));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(DEFAULT_MAX_RANK));
  // 20, not the 500 a hero-level stat would use: these are per-*pairing* samples, and on a single
  // patch at a narrow rank band even the most common duo only reaches a few hundred games.
  const [minMatches, setMinMatches] = useQueryState("min_matches", parseAsInteger.withDefault(20));
  const { startDate, endDate, handleDateChange } = useDateRangeState();
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(startDate, endDate);

  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [pairDetail, setPairDetail] = useState<PairRow | null>(null);
  const [laneDetail, setLaneDetail] = useState<LaneRow | null>(null);

  // Street Brawl is deliberately not offered: it is four a side with no lanes, so nothing on this
  // page would mean anything there.
  const sharedFilters = {
    gameMode: "normal" as const,
    matchMode,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    minAverageBadge: minRankId === 0 ? undefined : minRankId,
    maxAverageBadge: maxRankId >= DEFAULT_MAX_RANK ? undefined : maxRankId,
  };

  // Synergy and counters are read lane-agnostically; the lane endpoint is what supplies the
  // laning-phase term, so the three model inputs stay independent of one another.
  //
  // The Min Matches filter gates the stats themselves, not just the recommendation list: a pairing
  // under the threshold is dropped server-side so it can never move the prediction.
  const matrixParams = { ...sharedFilters, sameLaneFilter: false, minMatches: minMatches || 1 };
  const laneCounterParams: AnalyticsApiHeroCountersStatsRequest = { ...matrixParams, sameLaneFilter: true };

  const [heroesQuery, heroStatsQuery, synergyQuery, counterQuery, laneCounterQuery] = useQueries({
    queries: [
      heroesQueryOptions,
      heroStatsQueryOptions(sharedFilters),
      draftSynergyStatsQueryOptions(matrixParams),
      draftCounterStatsQueryOptions(matrixParams),
      draftCounterStatsQueryOptions(laneCounterParams),
    ],
  });

  const importQuery = useQuery(matchMetadataQueryOptions(importedMatchId));
  const allyTeam = sidesSwapped ? 1 : 0;
  const imported = useMemo(
    () => (importQuery.data ? parseImportedMatch(importQuery.data, allyTeam) : null),
    [importQuery.data, allyTeam],
  );

  const allyHeroes = filled(draft.ally);
  const enemyHeroes = filled(draft.enemy);
  // The endpoint filters by set membership, so sorting keeps a pure lane reshuffle on the same
  // cache entry instead of refetching identical rows under a new key.
  const laneQuery = useQuery(
    laneMatchupStatsQueryOptions({
      ...sharedFilters,
      heroIds: [...allyHeroes].sort((a, b) => a - b),
      enemyHeroIds: [...enemyHeroes].sort((a, b) => a - b),
      minMatches: 1,
    }),
  );

  const index = useMemo(
    () =>
      new StatsIndex(heroStatsQuery.data, synergyQuery.data, counterQuery.data, laneCounterQuery.data, laneQuery.data),
    [heroStatsQuery.data, synergyQuery.data, counterQuery.data, laneCounterQuery.data, laneQuery.data],
  );

  const playableHeroes = useMemo(() => filterPlayableHeroes(heroesQuery.data ?? []), [heroesQuery.data]);
  const candidates = useMemo(() => playableHeroes.map((hero) => hero.id), [playableHeroes]);

  const analysis = useMemo(() => analyzeDraft(draft, index), [draft, index]);
  const recommendations = useMemo(
    () => recommendPicks(draft, index, "ally", candidates, minMatches),
    [draft, index, candidates, minMatches],
  );
  const swapsBySlot = useMemo(() => {
    const bySide: Record<Side, Map<number, Swap>> = { ally: new Map(), enemy: new Map() };
    for (const side of ["ally", "enemy"] as const) {
      for (const swap of suggestSwaps(draft, index, side, candidates)) {
        bySide[side].set(swap.slot, swap);
      }
    }
    return bySide;
  }, [draft, index, candidates]);

  const laneSuggestions = useMemo(
    () => ({
      ally: suggestLaneAssignment(draft, index, "ally"),
      enemy: suggestLaneAssignment(draft, index, "enemy"),
    }),
    [draft, index],
  );

  // `heroesQuery` gates the candidate list, so leaving it out let the panels claim "no candidate
  // clears the minimum match count" while the roster was still loading.
  const { isPending, isError, error } = combineQueryStates(
    heroesQuery,
    heroStatsQuery,
    synergyQuery,
    counterQuery,
    laneCounterQuery,
  );
  const totalPicked = allyHeroes.length + enemyHeroes.length;
  const incompleteLanes = analysis.lanes.filter((lane) => !lane.complete).length;

  const dateSummary = formatDateRange(startDate, endDate);
  const filterSummary = `${MATCH_MODE_LABELS[matchMode]}${dateSummary ? ` · ${dateSummary}` : ""}`;

  const draftFromMatch = (match: ImportedMatch) => {
    for (const side of ["ally", "enemy"] as const) {
      const slots: (number | null)[] = Array(TEAM_SIZE).fill(null);
      for (const player of match.players.filter((p) => p.side === side)) slots[player.slot] = player.heroId;
      setSide(side, slots);
    }
  };

  // The URL already carries the draft, so a reload restores the picks; refetching the match only
  // repopulates the header, player names and badges. Only an explicit load overwrites the board.
  const applyMatch = async (matchId: number, allyTeam: 0 | 1) => {
    const metadata = await queryClient.fetchQuery(matchMetadataQueryOptions(matchId));
    draftFromMatch(parseImportedMatch(metadata, allyTeam));
  };

  const loadMatch = async (matchId: number) => {
    void setSidesSwapped(null);
    void setImportedMatchId(matchId);
    await applyMatch(matchId, 0);
  };

  const flipSides = async () => {
    if (importedMatchId === null) return;
    const swapped = !sidesSwapped;
    void setSidesSwapped(swapped || null);
    await applyMatch(importedMatchId, swapped ? 1 : 0);
  };

  const clearDraft = () => {
    forgetImport();
    clearAll();
  };

  const randomComp = () => {
    const pool = [...candidates].sort(() => Math.random() - 0.5).slice(0, TEAM_SIZE * 2);
    forgetImport();
    setSide("ally", pool.slice(0, TEAM_SIZE));
    setSide("enemy", pool.slice(TEAM_SIZE));
  };

  const pickInto = (heroId: number) => {
    if (!pickerTarget) return;
    setSlot(pickerTarget.side, pickerTarget.slot, heroId);
    setPickerTarget(null);
  };

  const openNextSlot = (side: Side) => {
    const slot = nextOpenSlot(side) ?? 0;
    setPickerTarget({ side, slot });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Team Builder</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Draft a full 6v6, set the three lanes, and read the win rate that comes out of it
        </p>
      </div>

      <Filter.Root>
        <Filter.MatchMode value={matchMode} onChange={setMatchMode} />
        <Filter.RankRange
          minRank={minRankId}
          maxRank={maxRankId}
          onRankChange={(min, max) => {
            setMinRankId(min);
            setMaxRankId(max);
          }}
        />
        <Filter.SeasonPatchDate startDate={startDate} endDate={endDate} onDateChange={handleDateChange} />
        <Filter.MinMatches value={minMatches} onChange={setMinMatches} label="Min Matches" step={10} min={0} />
        <MatchImportControl
          matchId={importedMatchId}
          isLoading={importQuery.isFetching}
          error={(importQuery.error as Error | null)?.message}
          onLoad={(id) => void loadMatch(id)}
          onFlipSides={() => void flipSides()}
          onClear={clearDraft}
        />
      </Filter.Root>

      {isError ? (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Could not load the draft stats</AlertTitle>
          <AlertDescription>{error?.message}</AlertDescription>
        </Alert>
      ) : (
        <>
          {/* The board only needs hero assets, so it stays interactive while the stats load and the
              panels below carry their own skeletons. Blocking the whole page on a full matrix fetch
              would make every filter change feel like a reload. */}
          <Panel className="px-5 py-4">
            <DraftBoard
              controls={controls}
              analysis={analysis}
              imported={imported}
              loading={isPending}
              swaps={swapsBySlot}
              laneSuggestions={laneSuggestions}
              onPick={(side, slot) => setPickerTarget({ side, slot })}
            />
          </Panel>

          {totalPicked === 0 ? (
            <Panel className="items-center px-6 py-10 text-center">
              <UsersRoundIcon className="size-9 text-muted-foreground/40" />
              <div className="mt-3 text-base font-semibold">Pick a hero to start</div>
              <p className="mt-1 max-w-105 text-sm text-balance text-muted-foreground">
                Win rate, synergy and lane matchups appear as soon as two heroes share a side. Lanes are optional; the
                team-wide numbers work without them.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button className="gap-1.5 rounded-full" onClick={() => openNextSlot("ally")}>
                  <SearchIcon className="size-3.5" />
                  Add hero
                </Button>
                <Button variant="secondary" className="gap-1.5 rounded-full" onClick={randomComp}>
                  <DicesIcon className="size-3.5" />
                  Random comp
                </Button>
              </div>
            </Panel>
          ) : (
            <>
              <LaneCards lanes={analysis.lanes} index={index} loading={isPending} onOpen={setLaneDetail} />

              {incompleteLanes > 0 && (
                <Alert className="border-primary/25 bg-primary/[0.06] [&>svg]:text-primary">
                  <TriangleAlertIcon />
                  <AlertDescription className="text-[13px] text-foreground">
                    {incompleteLanes === 1 ? "One lane is" : `${incompleteLanes} lanes are`} still incomplete. Lane win
                    rates stay blank until both slots on both sides of a lane are filled.
                  </AlertDescription>
                </Alert>
              )}

              {/* Equal-height columns: each panel is its own grid item, so the three stay level
                  however tall their contents run. */}
              <div className="grid gap-3 sm:auto-rows-fr sm:grid-cols-3">
                <NextPickPanel
                  recommendations={recommendations}
                  hasOpenSlot={nextOpenSlot("ally") !== null}
                  loading={isPending}
                  onPick={(heroId) => {
                    const slot = nextOpenSlot("ally");
                    if (slot !== null) setSlot("ally", slot, heroId);
                  }}
                />

                <PairsPanel pairs={analysis.allyPairs} index={index} loading={isPending} onOpen={setPairDetail} />

                <CounterMatrix
                  analysis={analysis}
                  index={index}
                  loading={isPending}
                  onOpen={(cell) => {
                    const pair = analysis.allyPairs.find((p) => p.a === cell.hero || p.b === cell.hero);
                    if (pair) setPairDetail(pair);
                  }}
                />
              </div>
            </>
          )}
        </>
      )}

      <HeroPickerDialog
        target={pickerTarget}
        draft={draft}
        index={index}
        heroes={playableHeroes}
        minMatches={minMatches}
        onSelect={pickInto}
        onClose={() => setPickerTarget(null)}
      />
      <DetailDialog value={pairDetail} onClose={() => setPairDetail(null)}>
        {(pair) => <PairDetailBody pair={pair} analysis={analysis} index={index} filterSummary={filterSummary} />}
      </DetailDialog>
      <DetailDialog value={laneDetail} onClose={() => setLaneDetail(null)}>
        {(lane) => <LaneDetailBody lane={lane} index={index} filterSummary={filterSummary} />}
      </DetailDialog>
    </div>
  );
}
