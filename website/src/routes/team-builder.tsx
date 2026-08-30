import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { AnalyticsApiHeroCountersStatsRequest } from "deadlock_api_client";
import { DicesIcon, RotateCwIcon, SearchIcon, TriangleAlertIcon, UsersRoundIcon } from "lucide-react";
import { parseAsBoolean, parseAsInteger, useQueryState } from "nuqs";
import { useCallback, useMemo, useState } from "react";

import { Filter } from "~/components/Filter";
import { formatDateRange } from "~/components/Filter/utils";
import { combineQueryStates } from "~/components/QueryRenderer";
import { type Mode, MODE_CONFIG } from "~/components/selectors/ModeSelector";
import { CounterMatrix } from "~/components/team-builder/CounterMatrix";
import { DetailDialog } from "~/components/team-builder/DetailDialog";
import { DraftBoard } from "~/components/team-builder/DraftBoard";
import { HeroPickerDialog, type PickerTarget } from "~/components/team-builder/HeroPickerDialog";
import { LaneCards } from "~/components/team-builder/LaneCards";
import { MatchImportControl } from "~/components/team-builder/MatchImportControl";
import { NextPickPanel } from "~/components/team-builder/NextPickPanel";
import { PairDetailBody } from "~/components/team-builder/PairDetailDialog";
import { PairsPanel } from "~/components/team-builder/PairsPanel";
import { Panel } from "~/components/team-builder/Panel";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { useDateRangeState } from "~/hooks/useDateRangeState";
import { useDraft } from "~/hooks/useDraft";
import { useModeState } from "~/hooks/useModeState";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { seo } from "~/lib/seo";
import {
  analyzeDraft,
  filled,
  type PairRow,
  rankSwaps,
  recommendPicks,
  type Side,
  SoulCurves,
  StatsIndex,
  type Swap,
  suggestLaneAssignment,
} from "~/lib/team-builder/analysis";
import { lanesOf, TEAM_SIZE } from "~/lib/team-builder/lanes";
import { filterPlayableHeroes, heroesQueryOptions } from "~/queries/asset-queries";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";
import { laneMatchupStatsQueryOptions } from "~/queries/lane-matchup-query";
import { laneSoulCurveQueryOptions } from "~/queries/lane-soul-curve-query";
import {
  type ImportedMatch,
  type MatchMetadata,
  matchMetadataQueryOptions,
  parseImportedMatch,
  recentMatchesQueryOptions,
} from "~/queries/match-import-query";
import { draftCounterStatsQueryOptions, draftSynergyStatsQueryOptions } from "~/queries/team-builder-queries";

const DEFAULT_MIN_RANK = 0;
const DEFAULT_MAX_RANK = 116;

export const Route = createFileRoute("/team-builder")({
  component: TeamBuilderPage,
  head: () =>
    seo({
      title: "Deadlock Team Builder: Draft a 6v6 or Street Brawl 4v4 and Read the Win Rate",
      description:
        "Draft a full Deadlock 6v6 with its three lanes, or a 4v4 Street Brawl, and see the predicted win rate broken down into lane matchups, pair synergy, counter picks and solo hero strength.",
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
  const { mode, setMode, gameMode, matchMode } = useModeState();
  const controls = useDraft(gameMode, forgetImport);
  const { draft, setSlot, setSide, clearAll, nextOpenSlot } = controls;
  const hasLanes = lanesOf(gameMode).length > 0;

  // A 6v6 draft says nothing about a 4v4 and the other way round, so crossing between the two game
  // modes starts the board over. Ranked and unranked share a board.
  const changeMode = (next: Mode) => {
    if (MODE_CONFIG[next].gameMode !== gameMode) {
      forgetImport();
      clearAll();
    }
    setMode(next);
  };
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(DEFAULT_MIN_RANK));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(DEFAULT_MAX_RANK));
  const { startDate, endDate, handleDateChange } = useDateRangeState();
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(startDate, endDate);

  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [pairDetail, setPairDetail] = useState<PairRow | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const supportsRank = MODE_CONFIG[mode].supportsRank;
  const sharedFilters = {
    gameMode,
    matchMode,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    minAverageBadge: !supportsRank || minRankId === 0 ? undefined : minRankId,
    maxAverageBadge: !supportsRank || maxRankId >= DEFAULT_MAX_RANK ? undefined : maxRankId,
  };

  // Synergy and counters are read lane-agnostically; the lane endpoint is what supplies the
  // laning-phase term, so the three model inputs stay independent of one another.
  const matrixParams = { ...sharedFilters, sameLaneFilter: false, minMatches: 1 };
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
  const laneParams = {
    ...sharedFilters,
    heroIds: [...allyHeroes].sort((a, b) => a - b),
    enemyHeroIds: [...enemyHeroes].sort((a, b) => a - b),
    minMatches: 1,
  };
  // Both lane endpoints are meaningless without lanes, so Street Brawl never asks for them.
  const laneMatchupOptions = laneMatchupStatsQueryOptions(laneParams);
  const laneQuery = useQuery({ ...laneMatchupOptions, enabled: hasLanes && laneMatchupOptions.enabled });
  const soulCurveOptions = laneSoulCurveQueryOptions(laneParams);
  const soulCurveQuery = useQuery({ ...soulCurveOptions, enabled: hasLanes && soulCurveOptions.enabled });

  const index = useMemo(
    () =>
      new StatsIndex(
        gameMode,
        heroStatsQuery.data,
        synergyQuery.data,
        counterQuery.data,
        laneCounterQuery.data,
        laneQuery.data,
      ),
    [gameMode, heroStatsQuery.data, synergyQuery.data, counterQuery.data, laneCounterQuery.data, laneQuery.data],
  );
  const soulCurves = useMemo(() => new SoulCurves(soulCurveQuery.data), [soulCurveQuery.data]);

  const playableHeroes = useMemo(() => filterPlayableHeroes(heroesQuery.data ?? []), [heroesQuery.data]);
  const candidates = useMemo(() => playableHeroes.map((hero) => hero.id), [playableHeroes]);

  const analysis = useMemo(() => analyzeDraft(draft, index), [draft, index]);
  const recommendations = useMemo(
    () => ({
      ally: recommendPicks(draft, index, "ally", candidates),
      enemy: recommendPicks(draft, index, "enemy", candidates),
    }),
    [draft, index, candidates],
  );
  const rankedSwaps = useMemo(
    () => ({
      ally: rankSwaps(draft, index, "ally", candidates),
      enemy: rankSwaps(draft, index, "enemy", candidates),
    }),
    [draft, index, candidates],
  );
  // `rankedSwaps` is already sorted by gain, so the first entry seen for a slot is that slot's best.
  // Searching again here would double the heaviest recompute on the page for the same answer.
  const swapsBySlot = useMemo(() => {
    const bySide: Record<Side, Map<number, Swap>> = { ally: new Map(), enemy: new Map() };
    for (const side of ["ally", "enemy"] as const) {
      for (const swap of rankedSwaps[side]) {
        if (!bySide[side].has(swap.slot)) bySide[side].set(swap.slot, swap);
      }
    }
    return bySide;
  }, [rankedSwaps]);

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
  const refetchStats = () =>
    Promise.all([
      heroesQuery.refetch(),
      heroStatsQuery.refetch(),
      synergyQuery.refetch(),
      counterQuery.refetch(),
      laneCounterQuery.refetch(),
    ]);

  const totalPicked = allyHeroes.length + enemyHeroes.length;
  const incompleteLanes = analysis.lanes.filter((lane) => !lane.complete).length;

  const dateSummary = formatDateRange(startDate, endDate);
  const filterSummary = `${MODE_CONFIG[mode].label}${dateSummary ? ` · ${dateSummary}` : ""}`;

  const draftFromMatch = (match: ImportedMatch) => {
    for (const side of ["ally", "enemy"] as const) {
      const slots: (number | null)[] = Array(TEAM_SIZE[match.gameMode]).fill(null);
      for (const player of match.players.filter((p) => p.side === side)) slots[player.slot] = player.heroId;
      setSide(side, slots);
    }
  };

  /** Puts a fetched match on the board, moving the page to that match's game mode if it is in the other one. */
  const adoptMatch = (matchId: number, metadata: MatchMetadata) => {
    const match = parseImportedMatch(metadata, 0);
    if (match.gameMode !== gameMode) setMode(match.gameMode === "street_brawl" ? "street_brawl" : "normal_all");
    void setSidesSwapped(null);
    void setImportedMatchId(matchId);
    draftFromMatch(match);
  };

  // The URL already carries the draft, so a reload restores the picks; refetching the match only
  // repopulates the header, player names and badges. Only an explicit load overwrites the board.
  const applyMatch = async (matchId: number, allyTeam: 0 | 1) => {
    const metadata = await queryClient.fetchQuery(matchMetadataQueryOptions(matchId));
    draftFromMatch(parseImportedMatch(metadata, allyTeam));
  };

  // The id is written only once the fetch succeeds: setting it first left a failed import with
  // `match=<id>` in the URL, so a shared link claimed to reference a match that does not exist.
  const loadMatch = async (matchId: number) => {
    setImportError(null);
    setImporting(true);
    try {
      adoptMatch(matchId, await queryClient.fetchQuery(matchMetadataQueryOptions(matchId)));
    } catch (error) {
      // A transport failure carries a status and an unreadable message; anything the query threw
      // itself already reads as a sentence and is kept.
      const status = (error as { response?: { status?: number } })?.response?.status;
      const thrown = error instanceof Error ? error.message : "";
      if (status === 404) setImportError(`No match found with ID ${matchId}.`);
      else if (status !== undefined) setImportError(`Could not load match ${matchId}. Please try again.`);
      else setImportError(thrown || `Could not load match ${matchId}.`);
    } finally {
      setImporting(false);
    }
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

  const randomHeroes = () => {
    const teamSize = TEAM_SIZE[gameMode];
    const pool = [...candidates].sort(() => Math.random() - 0.5).slice(0, teamSize * 2);
    forgetImport();
    setSide("ally", pool.slice(0, teamSize));
    setSide("enemy", pool.slice(teamSize));
  };

  /**
   * Seeds the board from a recently played draft, falling back to a shuffle of the roster. Real
   * matches are only drawn for normal mode: Street Brawl games are never used as a seed.
   */
  const randomComp = async () => {
    if (gameMode !== "normal") {
      randomHeroes();
      return;
    }
    setImportError(null);
    setImporting(true);
    try {
      const matches = await queryClient.fetchQuery(recentMatchesQueryOptions);

      const match = matches[Math.floor(Math.random() * matches.length)];
      if (match) {
        adoptMatch(match.match_id, await queryClient.fetchQuery(matchMetadataQueryOptions(match.match_id)));
        return;
      }
    } catch {
      // The fallback below still produces a comp.
    } finally {
      setImporting(false);
    }
    randomHeroes();
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
          {hasLanes
            ? "Draft a full 6v6, set the three lanes, and read the win rate that comes out of it"
            : "Draft a full Street Brawl 4v4 and read the win rate that comes out of it"}
        </p>
      </div>

      <Filter.Root>
        <Filter.ModeWithRank
          mode={mode}
          onModeChange={changeMode}
          minRank={minRankId}
          maxRank={maxRankId}
          onRankChange={(min, max) => {
            setMinRankId(min);
            setMaxRankId(max);
          }}
        />
        <Filter.SeasonPatchDate startDate={startDate} endDate={endDate} onDateChange={handleDateChange} />
        <MatchImportControl
          matchId={importedMatchId}
          isLoading={importQuery.isFetching || importing}
          error={importError ?? (importQuery.error as Error | null)?.message}
          onLoad={(id) => void loadMatch(id)}
          onFlipSides={() => void flipSides()}
          onClear={clearDraft}
        />
      </Filter.Root>

      {/* Above the board rather than replacing it: the stats failing says nothing about the draft,
          and swapping the page out would take the user's picks off screen with it. */}
      {isError && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Could not load the draft stats</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span title={error?.message}>Your draft is unchanged. The numbers below need the stats to load.</span>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => void refetchStats()}>
              <RotateCwIcon className="size-3" />
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

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

      {!isError && (
        <>
          {totalPicked === 0 ? (
            <Panel className="items-center px-6 py-10 text-center">
              <UsersRoundIcon className="size-9 text-muted-foreground/40" />
              <div className="mt-3 text-base font-semibold">Pick a hero to start</div>
              <p className="mt-1 max-w-105 text-sm text-balance text-muted-foreground">
                {hasLanes
                  ? "Win rate, synergy and lane matchups appear as soon as two heroes share a side. Lanes are optional; the team-wide numbers work without them."
                  : "Win rate, synergy and counters appear as soon as two heroes share a side."}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button className="gap-1.5 rounded-full" onClick={() => openNextSlot("ally")}>
                  <SearchIcon className="size-3.5" />
                  Add hero
                </Button>
                <Button
                  variant="secondary"
                  className="gap-1.5 rounded-full"
                  disabled={importing}
                  onClick={() => void randomComp()}
                >
                  <DicesIcon className="size-3.5" />
                  Random comp
                </Button>
              </div>
            </Panel>
          ) : (
            <>
              {hasLanes && (
                <LaneCards
                  lanes={analysis.lanes}
                  index={index}
                  loading={isPending}
                  soulCurves={soulCurves}
                  curveLoading={soulCurveQuery.isFetching}
                />
              )}

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
                  however tall their contents run. Three across only from 2xl — each needs ~340px for
                  a hero column plus three numeric ones, and the sidebar takes 256px off the viewport. */}
              <div className="grid gap-3 lg:grid-cols-2 2xl:auto-rows-fr 2xl:grid-cols-3">
                <NextPickPanel
                  gameMode={gameMode}
                  recommendations={recommendations}
                  swaps={rankedSwaps}
                  hasOpenSlot={{ ally: nextOpenSlot("ally") !== null, enemy: nextOpenSlot("enemy") !== null }}
                  loading={isPending}
                  onPick={(side, heroId) => {
                    const slot = nextOpenSlot(side);
                    if (slot !== null) setSlot(side, slot, heroId);
                  }}
                  onApplySwap={(side, swap) => setSlot(side, swap.slot, swap.in)}
                />

                <PairsPanel
                  allyPairs={analysis.allyPairs}
                  enemyPairs={analysis.enemyPairs}
                  index={index}
                  loading={isPending}
                  onOpen={setPairDetail}
                />

                <CounterMatrix analysis={analysis} index={index} loading={isPending} />
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
        onSelect={pickInto}
        onClose={() => setPickerTarget(null)}
      />
      <DetailDialog value={pairDetail} onClose={() => setPairDetail(null)}>
        {(pair) => <PairDetailBody pair={pair} analysis={analysis} index={index} filterSummary={filterSummary} />}
      </DetailDialog>
    </div>
  );
}
