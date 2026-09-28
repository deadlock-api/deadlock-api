import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { GitCompareArrows } from "lucide-react";

import { SERIES_COLORS } from "~/components/patterns/charts/theme";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { Grid } from "~/components/ui/grid";
import { Stack } from "~/components/ui/stack";
import { aggregateHeroStats, compareColorIndexes } from "~/lib/player-compare";
import { playerPairs, splitPairs } from "~/lib/player-compare-pairs";
import { playstyleLabel, playstylePercentiles } from "~/lib/playstyle";
import { type CompareFilters, compareHeroStatsParams, playerRanksQueryOptions } from "~/queries/player-compare-queries";
import { steamProfileQueryOptions, trackerHeroStatsQueryOptions } from "~/queries/tracker-queries";

import { ActivityPanel } from "./ActivityPanel";
import { AddPlayerControls } from "./AddPlayerControls";
import { HeadToHeadTable } from "./HeadToHeadTable";
import { ItemPreferencesPanel } from "./ItemPreferencesPanel";
import { MatchLengthPanel } from "./MatchLengthPanel";
import { PercentileComparison } from "./PercentileComparison";
import { PerformanceTrendPanel } from "./PerformanceTrendPanel";
import { PlayerCards } from "./PlayerCards";
import { PlaystyleRadarPanel } from "./PlaystyleRadarPanel";
import { RankHistoryPanel } from "./RankHistoryPanel";
import { RecordsPanel } from "./RecordsPanel";
import { ShareComparison } from "./ShareComparison";
import { SharedHeroesTable } from "./SharedHeroesTable";
import { TimelinePanel } from "./TimelinePanel";
import { TogetherAgainstPanel } from "./TogetherAgainstPanel";
import type { ComparedPlayer } from "./types";
import { useCompareMatchHistories } from "./useCompareMatchHistories";
import { useCompareMetrics } from "./useCompareMetrics";
import { usePlayerCompareState } from "./usePlayerCompareState";

/**
 * The top grid's classes for up to three players. Narrow: one column. From @4xl two columns: the stat table spans three
 * rows beside the share card, the playstyle and match length; then records beside the weekly trend, and rank over time
 * across both. From @8xl a 3x3 grid: the table spans all three rows on the left, and each row pairs share / records,
 * playstyle / match length, trend / rank at one height. The source follows the 3x3 grid's reading order; `order`
 * rearranges the narrower layouts.
 */
const LAYOUT = {
  // The playstyle keeps its own height beside the table; the share card and match length above and below it share the
  // rest, the card and the plot scaling to it.
  grid: "@4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] @4xl:grid-rows-[1fr_auto_1fr] @8xl:grid-cols-[minmax(0,4fr)_minmax(0,3fr)_minmax(0,3fr)] @8xl:grid-rows-none",
  table: "order-1 @4xl:row-span-3 @8xl:order-none",
  share: "order-2 @8xl:order-none",
  records: "order-5 @8xl:order-none",
  radar: "order-3 @8xl:order-none",
  length: "order-4 @8xl:order-none",
  trend: "order-6 @8xl:order-none",
  rank: "order-7 @4xl:col-span-2 @8xl:order-none @8xl:col-span-1",
};

/** Four or five players: the table spans the width until @7xl, then two columns, the 3x3 grid from @9xl. */
const WIDE_LAYOUT = {
  grid: "@4xl:grid-cols-2 @7xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] @7xl:grid-rows-[1fr_auto_1fr] @9xl:grid-cols-[minmax(0,4fr)_minmax(0,3fr)_minmax(0,3fr)] @9xl:grid-rows-none",
  table: "order-1 @4xl:col-span-2 @7xl:col-span-1 @7xl:row-span-3 @9xl:order-none",
  share: "order-2 @9xl:order-none",
  records: "order-5 @9xl:order-none",
  radar: "order-3 @9xl:order-none",
  length: "order-4 @9xl:order-none",
  trend: "order-6 @9xl:order-none",
  rank: "order-7 @7xl:col-span-2 @9xl:order-none @9xl:col-span-1",
};

/** The compare tab: pick up to five players, then see who wins which stat on the page's filters. */
export function PlayerComparison({ filters }: { filters: CompareFilters }) {
  const { accountIds, add, remove, move } = usePlayerCompareState();
  // One query a player, shared with the tracker: adding or reordering players never refetches (and blanks) the names
  // already on screen.
  const profileQueries = useQueries({ queries: accountIds.map((accountId) => steamProfileQueryOptions(accountId)) });
  const hasPlayers = accountIds.length > 0;

  const ranks = useQuery({
    ...playerRanksQueryOptions(accountIds),
    enabled: hasPlayers,
    placeholderData: keepPreviousData,
  });
  const heroStats = useQuery({
    ...trackerHeroStatsQueryOptions(compareHeroStatsParams(accountIds, filters)),
    enabled: hasPlayers,
    // A new player or filter keeps the table on screen while it loads; the new column waits in a skeleton.
    placeholderData: keepPreviousData,
  });

  const metrics = useCompareMetrics(accountIds, filters);
  /** A player's average of one metric: undefined while it loads, null when it failed or has no value. */
  const metricAverage = (index: number, key: string) => {
    if (metrics.pending[index] ?? true) return undefined;
    return metrics.own[index]?.[key]?.avg ?? null;
  };

  const histories = useCompareMatchHistories(accountIds, filters);

  const rows = heroStats.data ?? [];
  const ranksSettled = ranks.isSuccess && !ranks.isPlaceholderData;
  // Placeholder rows belong to the previous request: a player missing from them may just have been added, so they
  // are still loading rather than without matches.
  const settled = heroStats.isSuccess && !heroStats.isPlaceholderData;
  const colorIndexes = compareColorIndexes(accountIds);
  const players: ComparedPlayer[] = accountIds.map((accountId, index) => {
    const profile = profileQueries[index]?.data ?? undefined;
    const known = settled || rows.some((row) => row.account_id === accountId);
    // A failed lookup, or a player the answer left out (a protected account), is "unavailable" (null), not a
    // skeleton that never resolves.
    const badge =
      ranks.isError && !ranks.data
        ? null
        : (ranks.data?.find((rank) => rank.account_id === accountId)?.badge ?? (ranksSettled ? null : undefined));
    const aggregate = known ? aggregateHeroStats(rows, accountId) : undefined;
    return {
      accountId,
      name: profile?.personaname ?? `Player ${accountId}`,
      avatar: profile?.avatarfull || profile?.avatar,
      profileLoading: (profileQueries[index]?.isPending ?? true) && !profile,
      color: SERIES_COLORS[colorIndexes[index] % SERIES_COLORS.length],
      playstyle: playstyleLabel(playstylePercentiles(metrics.population, metrics.own[index]))?.label,
      rankBadge: badge === undefined ? undefined : badge || null,
      aggregate: aggregate && {
        ...aggregate,
        // Unranked (badge 0) has no rank to compare.
        rankBadge: badge === undefined ? undefined : badge || null,
        healingPerMin: metricAverage(index, "healing_per_min"),
        healPreventedPerMatch: metricAverage(index, "heal_prevented"),
      },
    };
  });

  const layout = players.length >= 4 ? WIDE_LAYOUT : LAYOUT;
  // On one hero's filter every shared hero is that hero.
  const showSharedHeroes = filters.heroId == null && accountIds.length >= 2;
  // Once the histories are in and no two players met, together & against is one line: it goes under heroes and items
  // across the page rather than taking a tall, empty third column beside them.
  const nobodyMet =
    histories.every((history) => !history.isPending && !history.isError) &&
    splitPairs(playerPairs(histories)).met.length === 0;
  const threeUp = showSharedHeroes && players.length < 4 && !nobodyMet;

  return (
    <Stack gap={4} className="@container">
      {heroStats.isError && !heroStats.data && (
        <ErrorState
          title="Could not load the players' stats"
          description={heroStats.error.message}
          onRetry={() => void heroStats.refetch()}
          retrying={heroStats.isFetching}
        />
      )}
      {!hasPlayers ? (
        <EmptyState
          icon={GitCompareArrows}
          title="Who's the better player?"
          action={<AddPlayerControls filters={filters} accountIds={accountIds} onAdd={add} />}
          className="py-12"
        />
      ) : (
        <>
          <PlayerCards
            players={players}
            rows={rows}
            histories={histories}
            filters={filters}
            onAdd={add}
            onRemove={remove}
            onMove={move}
          />
          {/* One grid, so every edge lines up; see LAYOUT for the arrangement at each width. */}
          <Grid gap={4} className={layout.grid}>
            <HeadToHeadTable players={players} className={layout.table} />
            <ShareComparison filters={filters} className={layout.share} />
            <RecordsPanel
              players={players}
              histories={histories}
              heroFiltered={filters.heroId != null}
              className={layout.records}
            />
            <PlaystyleRadarPanel players={players} metrics={metrics} className={layout.radar} />
            <MatchLengthPanel players={players} histories={histories} className={layout.length} />
            <PerformanceTrendPanel players={players} histories={histories} className={layout.trend} />
            <RankHistoryPanel players={players} filters={filters} histories={histories} className={layout.rank} />
          </Grid>
          <PercentileComparison players={players} metrics={metrics} />
          {/* How a match goes for each, then when they play: the timeline, the hours and the weekdays at one height. */}
          <Grid
            gap={4}
            className="@4xl:grid-cols-[minmax(0,3fr)_minmax(0,3fr)_minmax(0,2fr)] @8xl:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)]"
          >
            <TimelinePanel players={players} filters={filters} />
            <ActivityPanel players={players} histories={histories} by="hour" />
            <ActivityPanel players={players} histories={histories} by="weekday" />
          </Grid>
          {/* Heroes, items and together & against. Up to three players: heroes beside items, together & against under
              both, and very wide all three in a row. Four or five players: each takes the full width, which their
              columns need. On one hero's filter there are no shared heroes: items beside together & against. */}
          <Grid
            gap={4}
            className={
              players.length >= 4 ? undefined : threeUp ? "@xl:grid-cols-2 @8xl:grid-cols-3" : "@xl:grid-cols-2"
            }
          >
            {showSharedHeroes && <SharedHeroesTable players={players} rows={rows} loading={heroStats.isPending} />}
            <ItemPreferencesPanel
              players={players}
              filters={filters}
              // Nothing beside it (one player, or one hero's filter where nobody met): the full width, not half.
              className={
                players.length < 4 && !showSharedHeroes && (accountIds.length < 2 || nobodyMet)
                  ? "@xl:col-span-2"
                  : undefined
              }
            />
            {accountIds.length >= 2 && (
              <TogetherAgainstPanel
                players={players}
                histories={histories}
                className={
                  threeUp
                    ? "@xl:col-span-2 @8xl:col-span-1"
                    : players.length < 4 && (nobodyMet || showSharedHeroes)
                      ? "@xl:col-span-2"
                      : undefined
                }
              />
            )}
          </Grid>
        </>
      )}
    </Stack>
  );
}
