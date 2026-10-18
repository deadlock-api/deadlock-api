import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { RankedEntityList, RankedEntityMetric, RankedEntityRow } from "~/components/domain/assets/RankedEntityList";
import { PanelSection } from "~/components/patterns/panel/Panel";
import { StaleOverlay } from "~/components/patterns/states/StaleOverlay";
import { Skeleton } from "~/components/ui/skeleton";
import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import type { BuildRow } from "~/lib/build-stats";
import { formatPercent, formatSignedPoints } from "~/lib/format";
import { toneOf } from "~/lib/tone";
import { winRateNoise } from "~/lib/wilson";
import type { BuildPurchaseFilters } from "~/queries/hero-build-stats-query";
import { queryKeys } from "~/queries/query-keys";

/** Matchups with fewer matches than this are left out: their win rate is mostly noise. */
const MIN_MATCHUP_MATCHES = 30;
const SHOWN = 3;
/** Where a difference's bar reaches its edge: ten points either way. */
const CHANGE_SCALE = 0.1;

interface Matchup {
  heroId: number;
  wins: number;
  matches: number;
  winRate: number;
}

function MatchupList({ title, matchups, build }: { title: string; matchups: Matchup[]; build: BuildRow }) {
  return (
    <section className="flex flex-col">
      <PanelSection variant="label" title={title} />
      <RankedEntityList density="compact" columns="single" className="px-3">
        {matchups.map((matchup, index) => {
          const change = matchup.winRate - build.winRate;
          return (
            <RankedEntityRow
              key={matchup.heroId}
              rank={index + 1}
              entity={{ heroId: matchup.heroId }}
              meta={`${matchup.matches.toLocaleString("en-US")} matches`}
            >
              <RankedEntityMetric
                label="Win rate"
                labelDisplay={index === 0 ? "visible" : "hidden"}
                value={formatPercent(matchup.winRate)}
              />
              <RankedEntityMetric
                label="Diff"
                labelDisplay="hidden"
                width="wide"
                value={formatSignedPoints(change)}
                // Only a difference outside the matchup's noise takes a color.
                tone={Math.abs(change) < winRateNoise(matchup.matches) ? "muted" : toneOf(Math.round(change * 1000))}
                change={{ value: change, scale: CHANGE_SCALE }}
              />
            </RankedEntityRow>
          );
        })}
      </RankedEntityList>
    </section>
  );
}

/**
 * The enemy heroes the build wins most and least against, over every enemy in the match (not only the lane), each
 * against the build's own win rate.
 */
export function BuildMatchups({
  heroId,
  build,
  filters,
  active = true,
}: {
  heroId: number;
  build: BuildRow;
  filters: BuildPurchaseFilters;
  /** False while the selection is still moving: nothing is asked for yet. */
  active?: boolean;
}) {
  const request = {
    gameMode: "normal" as const,
    matchMode: filters.matchMode,
    minAverageBadge: filters.minAverageBadge,
    maxAverageBadge: filters.maxAverageBadge,
    minUnixTimestamp: filters.minUnixTimestamp,
    maxUnixTimestamp: filters.maxUnixTimestamp,
    sameLaneFilter: false,
    minMatches: MIN_MATCHUP_MATCHES,
    heroBuildId: build.hero_build_id,
  };
  const query = useQuery({
    queryKey: queryKeys.analytics.heroCounterStats(request),
    queryFn: async (): Promise<Matchup[]> => {
      const response = await api.analytics_api.heroCountersStats(request);
      return (
        response.data
          // The build's players are all of its hero; any other hero's pairs are not about this build.
          .filter((row) => row.hero_id === heroId && row.matches_played >= MIN_MATCHUP_MATCHES)
          .map((row) => ({
            heroId: row.enemy_hero_id,
            wins: row.wins,
            matches: row.matches_played,
            winRate: row.wins / row.matches_played,
          }))
      );
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
    enabled: active,
    placeholderData: keepPreviousData,
  });

  if (query.isError) return null;
  if (!query.data) {
    return (
      <section className="flex flex-col">
        <PanelSection variant="label" title="Strong against" />
        <div className="flex flex-col gap-2 px-3 py-2">
          {Array.from({ length: SHOWN }, (_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      </section>
    );
  }
  const sorted = [...query.data].sort((a, b) => b.winRate - a.winRate || b.matches - a.matches);
  if (sorted.length < SHOWN * 2) return null;
  return (
    <StaleOverlay active={query.isPlaceholderData} label="matchups">
      <MatchupList title="Strong against" matchups={sorted.slice(0, SHOWN)} build={build} />
      <MatchupList title="Weak against" matchups={sorted.slice(-SHOWN).reverse()} build={build} />
    </StaleOverlay>
  );
}
