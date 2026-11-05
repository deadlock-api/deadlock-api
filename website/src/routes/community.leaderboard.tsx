import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { LeaderboardRegionEnum } from "deadlock_api_client";
import { parseAsInteger, parseAsString, parseAsStringLiteral, throttle, useQueryState } from "nuqs";
import { useCallback } from "react";

import { Filter } from "~/components/domain/filters";
import { LeaderboardTable } from "~/components/features/leaderboard/LeaderboardTable";
import { FilterToggleCell } from "~/components/patterns/filter-bar/FilterCell";
import { StringOption, StringSelector } from "~/components/patterns/filter-bar/StringSelector";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { StaleOverlay } from "~/components/patterns/states/StaleOverlay";
import { SegmentedItem } from "~/components/ui/segmented";
import { useHeroById } from "~/hooks/useAssetById";
import { useSeasons } from "~/hooks/useSeasons";
import { prefetchCached } from "~/lib/prefetch-safe";
import { isLeaderboardRegion, REGION_LABELS } from "~/lib/region";
import { fetchDefaultRegion } from "~/lib/region-fns";
import { currentSeason, type SeasonInfo } from "~/lib/seasons";
import { datasetJsonLd, pageTitle, seo } from "~/lib/seo";
import { loadSeasons } from "~/queries/asset-queries";
import { leaderboardQueryOptions } from "~/queries/leaderboard-queries";

/**
 * The past season `season` (a season's `id`) names, or undefined for the current one, whose board the API serves
 * without a `leaderboard_id`. An unknown or board-less season also falls back to the current board.
 */
function pastSeason(seasons: readonly SeasonInfo[], season: string | null): SeasonInfo | undefined {
  if (season === null || season === currentSeason(seasons)?.id) return undefined;
  return seasons.find((s) => s.id === season && s.leaderboardId != null);
}

export const Route = createFileRoute("/community/leaderboard")({
  component: LeaderboardPage,
  // The region, hero and season filters live in the URL under nuqs; read them here so the loader warms the board the
  // page will show.
  loaderDeps: ({ search }) => {
    const { region, hero_id: heroId, season } = search as { region?: unknown; hero_id?: unknown; season?: unknown };
    return {
      region: isLeaderboardRegion(region) ? region : null,
      heroId: typeof heroId === "number" && Number.isInteger(heroId) ? heroId : null,
      season: typeof season === "string" ? season : null,
    };
  },
  loader: async ({ context: { queryClient }, deps }) => {
    // Resolved on the server on every visit, client-side navigations included, so the default follows the
    // visitor's location the same way each time.
    const [defaultRegion, seasons] = await Promise.all([fetchDefaultRegion(), loadSeasons(queryClient)]);
    const leaderboardId = pastSeason(seasons, deps.season)?.leaderboardId;
    await prefetchCached(
      queryClient,
      leaderboardQueryOptions(deps.region ?? defaultRegion, deps.heroId, leaderboardId),
    );
    return { defaultRegion };
  },
  head: () =>
    seo({
      title: pageTitle("Deadlock Leaderboards: Top Ranked Players by Region"),
      description:
        "Deadlock ranked leaderboards for every region: the top players and the heroes they play most. Filter by hero or search for any player.",
      path: "/community/leaderboard",
      jsonLd: datasetJsonLd({
        name: "Deadlock Leaderboards: Top Ranked Players by Region",
        description:
          "Ranked player standings for Deadlock across all regions, sortable by matchmaking rating and filterable by hero.",
        path: "/community/leaderboard",
        keywords: ["Deadlock", "leaderboard", "leaderboards", "top players", "ranked ladder"],
        variableMeasured: ["leaderboard rank", "most played heroes"],
        apiPath: "/v1/leaderboard/Europe",
      }),
    }),
});

/** Board and page change in one throttled URL update, so one history entry. */
const together = { limitUrlUpdates: throttle(50) };

function LeaderboardPage() {
  // Keep the generated API client's runtime enum in this route's component chunk.
  const regions = Object.values(LeaderboardRegionEnum) as [LeaderboardRegionEnum, ...LeaderboardRegionEnum[]];
  const { defaultRegion } = Route.useLoaderData();
  const [region, setRegionParam] = useQueryState("region", parseAsStringLiteral(regions).withDefault(defaultRegion));
  const [heroId, setHeroIdParam] = useQueryState("hero_id", parseAsInteger);
  const [seasonParam, setSeasonParam] = useQueryState("season", parseAsString);
  const [, setPage] = useQueryState("page", parseAsInteger);
  // Another board starts on its first page: a kept `page=6` showed an empty page for a four-player hero board and
  // jumped back to rank 126 when the hero was cleared.
  const setHeroId = useCallback(
    (id: number | null) => {
      void setHeroIdParam(id, together);
      void setPage(null, together);
    },
    [setHeroIdParam, setPage],
  );
  const setRegion = useCallback(
    (next: LeaderboardRegionEnum) => {
      void setRegionParam(next, together);
      void setPage(null, together);
    },
    [setRegionParam, setPage],
  );
  const { seasons } = useSeasons();
  const current = currentSeason(seasons);
  const past = pastSeason(seasons, seasonParam);
  const selectedSeason = past ?? current;
  const leaderboardId = past?.leaderboardId;
  // A season without a board of its own has nothing to show.
  const seasonOptions = seasons.filter((s) => s.leaderboardId != null);
  const setSeason = useCallback(
    (next: string) => {
      void setSeasonParam(next === current?.id ? null : next, together);
      void setPage(null, together);
    },
    [current?.id, setSeasonParam, setPage],
  );

  // A region or hero change keeps the old table, dimmed, until the new one arrives, instead of emptying the page.
  // `useQuery`, not `useQueries`: the latter starts a new observer for the new key, which has no previous data.
  const leaderboardQuery = useQuery({
    ...leaderboardQueryOptions(region, heroId, leaderboardId),
    placeholderData: keepPreviousData,
  });
  const { isPending, isError, error } = leaderboardQuery;
  const { hero } = useHeroById(heroId ?? -1);

  return (
    <PageShell>
      <PageHeader title="Deadlock Leaderboards" description="Ranked player standings across all regions">
        <p>
          Browse the top-ranked Deadlock players by region. Filter by hero to see who dominates with specific
          characters, search for any player, and jump to any rank to see where you stand on the competitive ladder.
          Rankings are based on matchmaking rating earned through ranked play.
        </p>
      </PageHeader>
      <Filter.Root>
        <Filter.Hero value={heroId} onValueChange={setHeroId} allowNull />
        <FilterToggleCell label="Region" value={region} defaultValue={defaultRegion} onValueChange={setRegion}>
          {regions.map((regionOption) => (
            <SegmentedItem key={regionOption} value={regionOption}>
              {REGION_LABELS[regionOption]}
            </SegmentedItem>
          ))}
        </FilterToggleCell>
        {current && seasonOptions.length > 1 ? (
          <StringSelector
            label="Season"
            value={(past ?? current).id}
            defaultValue={current.id}
            onValueChange={setSeason}
          >
            {seasonOptions.map((season) => (
              <StringOption key={season.id} value={season.id}>
                {season.name}
              </StringOption>
            ))}
          </StringSelector>
        ) : null}
      </Filter.Root>
      <div className="min-h-200">
        {isPending ? (
          <LoadingState label="leaderboard" className="flex items-center justify-center py-24" />
        ) : isError ? (
          <ErrorState
            title="Failed to load leaderboard"
            description={error?.message}
            retrying={leaderboardQuery.isFetching}
            onRetry={() => void leaderboardQuery.refetch()}
          />
        ) : leaderboardQuery.data ? (
          <StaleOverlay active={leaderboardQuery.isPlaceholderData} label="leaderboard">
            {/* Keyed by the board, so a jump or a highlighted rank from another board does not carry over. */}
            <LeaderboardTable
              key={`${region}-${heroId}-${leaderboardId}`}
              leaderboard={leaderboardQuery.data}
              label={`${REGION_LABELS[region]} leaderboard${hero?.name ? ` for ${hero.name}` : ""}${selectedSeason ? `, ${selectedSeason.name}` : ""}`}
              onHeroClick={setHeroId}
            />
          </StaleOverlay>
        ) : null}
      </div>
    </PageShell>
  );
}
