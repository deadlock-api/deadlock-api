import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { GitCompareArrows } from "lucide-react";

import { SERIES_COLORS } from "~/components/patterns/charts/theme";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { Grid } from "~/components/ui/grid";
import { Stack } from "~/components/ui/stack";
import { aggregateHeroStats } from "~/lib/player-compare";
import { playstyleLabel, playstylePercentiles } from "~/lib/playstyle";
import { cn } from "~/lib/utils";
import {
  type CompareFilters,
  compareHeroStatsParams,
  compareMetricsParams,
  playerRanksQueryOptions,
} from "~/queries/player-compare-queries";
import { playerStatsMetricsQueryOptions } from "~/queries/player-stats-metrics-query";
import { steamProfileQueryOptions, trackerHeroStatsQueryOptions } from "~/queries/tracker-queries";

import { AddPlayerControls } from "./AddPlayerControls";
import { HeadToHeadTable } from "./HeadToHeadTable";
import { ItemPreferencesPanel } from "./ItemPreferencesPanel";
import { PercentileComparison } from "./PercentileComparison";
import { PerformanceTrendPanel } from "./PerformanceTrendPanel";
import { PlayerCards } from "./PlayerCards";
import { PlaystyleRadarPanel } from "./PlaystyleRadarPanel";
import { RankHistoryPanel } from "./RankHistoryPanel";
import { ShareComparison } from "./ShareComparison";
import { SharedHeroesTable } from "./SharedHeroesTable";
import { TogetherAgainstPanel } from "./TogetherAgainstPanel";
import type { ComparedPlayer } from "./types";
import { useCompareMatchHistories } from "./useCompareMatchHistories";
import { usePlayerCompareState } from "./usePlayerCompareState";

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

  // The same requests as the curves below, so they share the cache: healing and heal prevented come from here.
  const population = useQuery(playerStatsMetricsQueryOptions(compareMetricsParams(filters)));
  const metrics = useQueries({
    queries: accountIds.map((accountId) => playerStatsMetricsQueryOptions(compareMetricsParams(filters, accountId))),
  });
  /** A player's average of one metric: undefined while it loads, null when it failed or has no value. */
  const metricAverage = (index: number, key: string) => {
    const query = metrics[index];
    if (!query || query.isPending) return undefined;
    return query.data?.[key]?.avg ?? null;
  };

  const histories = useCompareMatchHistories(accountIds, filters);

  const rows = heroStats.data ?? [];
  const ranksSettled = ranks.isSuccess && !ranks.isPlaceholderData;
  // Placeholder rows belong to the previous request: a player missing from them may just have been added, so they
  // are still loading rather than without matches.
  const settled = heroStats.isSuccess && !heroStats.isPlaceholderData;
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
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      playstyle: playstyleLabel(playstylePercentiles(population.data, metrics[index]?.data))?.label,
      aggregate: aggregate && {
        ...aggregate,
        // Unranked (badge 0) has no rank to compare.
        rankBadge: badge === undefined ? undefined : badge || null,
        healingPerMin: metricAverage(index, "healing_per_min"),
        healPreventedPerMatch: metricAverage(index, "heal_prevented"),
      },
    };
  });

  // On one hero's filter every shared hero is that hero.
  const showSharedHeroes = filters.heroId == null && accountIds.length >= 2;

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
          {/* Wide: the stat table on the left, the share card and the profile charts beside it. Four or five columns
              of values need the whole width until the page is very wide. Narrow: stacked. */}
          <Grid
            gap={4}
            className={cn(
              "items-start",
              players.length >= 4
                ? "@7xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
                : "@4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]",
            )}
          >
            <HeadToHeadTable players={players} />
            {/* Its own width decides: stacked under a wide table, the side panels pair up rather than stretch. */}
            <Grid columns={{ base: 1, xl: 2 }} gap={4} className="items-start">
              <Stack gap={4}>
                <ShareComparison filters={filters} />
                {accountIds.length >= 2 && <TogetherAgainstPanel players={players} histories={histories} />}
              </Stack>
              <PlaystyleRadarPanel players={players} filters={filters} />
            </Grid>
          </Grid>
          {/* Over time, side by side: the climb and the form. */}
          <Grid columns={{ base: 1, xl: 2 }} gap={4} className="items-start">
            <RankHistoryPanel players={players} filters={filters} histories={histories} />
            <PerformanceTrendPanel players={players} histories={histories} />
          </Grid>
          {showSharedHeroes && <SharedHeroesTable players={players} rows={rows} loading={heroStats.isPending} />}
          <ItemPreferencesPanel players={players} filters={filters} />
          <PercentileComparison players={players} filters={filters} />
        </>
      )}
    </Stack>
  );
}
