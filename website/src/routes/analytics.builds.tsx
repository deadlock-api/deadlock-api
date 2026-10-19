import { createFileRoute } from "@tanstack/react-router";
import { parseAsArrayOf, parseAsInteger, throttle, useQueryState, useQueryStates } from "nuqs";
import { startTransition, Suspense } from "react";

import { Filter } from "~/components/domain/filters";
import { BuildsExplorer, heroBuildStatsRequest, useBuildFacets } from "~/components/features/builds/BuildsExplorer";
import type { TriState } from "~/components/patterns/filter-bar/TriStateSelector";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { ChunkErrorBoundary } from "~/components/patterns/states/ChunkErrorBoundary";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { day } from "~/dayjs";
import { useKnownHeroId } from "~/hooks/useAssetById";
import { useDateRangeState } from "~/hooks/useDateRangeState";
import { useModeState } from "~/hooks/useModeState";
import {
  DEFAULT_MATCH_MODE,
  DEFAULT_MODE,
  getEffectiveRankRange,
  MATCH_MODES,
  MODE_CONFIG,
  modeFromParams,
} from "~/lib/game-mode";
import { prefetchCached } from "~/lib/prefetch-safe";
import { DEFAULT_RANK_RANGE } from "~/lib/rank-utils";
import { defaultTemporalCoverage, defaultUnixRange } from "~/lib/seasons";
import { datasetJsonLd, pageTitle, seo } from "~/lib/seo";
import { loadSeasons } from "~/queries/asset-queries";
import {
  buildMetaBatches,
  heroBuildMetaQueryOptions,
  heroBuildStatsQueryOptions,
} from "~/queries/hero-build-stats-query";

const DEFAULT_HERO_ID = 2;
const DEFAULT_MIN_MATCHES = 20;
const DEFAULT_MIN_PLAYERS = 1;
const TITLE = "Deadlock Build Stats: Best Hero Builds by Win Rate";
const DESCRIPTION =
  "Win rates of the published Deadlock hero builds players start their matches with: how popular each is, its items and skill order, by rank and patch.";

/** The hero builds analytics endpoint counts normal matches only; Street Brawl has no build to choose. */
const MODES = ["normal_all", "normal_ranked", "normal_unranked"] as const;

/** A choice re-renders the page in a transition, so the tap paints first; one choice is one history entry. */
const together = { limitUrlUpdates: throttle(50) };

export const Route = createFileRoute("/analytics/builds")({
  component: BuildsPage,
  // The filters live in the URL under nuqs; read them here so the loader warms the request the page will make, and a
  // shared link with a rank or mode renders its builds on the server too. A custom date range is left to the browser.
  loaderDeps: ({ search }) => {
    const { hero, min_rank, max_rank, min_matches, min_duration_s, max_duration_s, game_mode, match_mode, date_range } =
      search as Record<string, unknown>;
    const integer = <T,>(value: unknown, fallback: T) =>
      typeof value === "number" && Number.isInteger(value) ? value : fallback;
    const urlMode = modeFromParams(
      game_mode === "street_brawl" ? "street_brawl" : "normal",
      MATCH_MODES.find((mode) => mode === match_mode) ?? DEFAULT_MATCH_MODE,
    );
    const mode = urlMode === "street_brawl" ? DEFAULT_MODE : urlMode;
    const { effectiveMinRankId, effectiveMaxRankId } = getEffectiveRankRange(
      mode,
      integer(min_rank, DEFAULT_RANK_RANGE.min),
      integer(max_rank, DEFAULT_RANK_RANGE.max),
    );
    return {
      heroId: integer(hero, DEFAULT_HERO_ID),
      minRankId: effectiveMinRankId,
      maxRankId: effectiveMaxRankId,
      minMatches: integer(min_matches, DEFAULT_MIN_MATCHES),
      minDurationS: integer(min_duration_s, undefined),
      maxDurationS: integer(max_duration_s, undefined),
      matchMode: MODE_CONFIG[mode].matchMode,
      customDates: date_range !== undefined,
    };
  },
  loader: async ({ context: { queryClient, preferences }, deps }) => {
    const seasons = await loadSeasons(queryClient);
    const range = defaultUnixRange(seasons, preferences.dateFilter);
    if (deps.customDates) return { coverage: defaultTemporalCoverage(seasons, preferences.dateFilter) };
    const stats = await prefetchCached(
      queryClient,
      heroBuildStatsQueryOptions(
        heroBuildStatsRequest({
          heroId: deps.heroId,
          minRankId: deps.minRankId,
          maxRankId: deps.maxRankId,
          ...range,
          minDurationS: deps.minDurationS,
          maxDurationS: deps.maxDurationS,
          minMatches: deps.minMatches,
          matchMode: deps.matchMode,
        }),
      ),
    );
    // The build names are the page's content: the server waits for them so its HTML carries them, and a navigation
    // in the browser too, so the build panel shows whole instead of growing its row under a skeleton.
    if (stats) {
      await Promise.all(
        buildMetaBatches(stats.map((row) => row.hero_build_id)).map((batch) =>
          prefetchCached(queryClient, heroBuildMetaQueryOptions(deps.heroId, batch)),
        ),
      );
    }
    return { coverage: defaultTemporalCoverage(seasons, preferences.dateFilter) };
  },
  head: ({ loaderData }) =>
    seo({
      title: pageTitle(TITLE),
      description: DESCRIPTION,
      path: "/analytics/builds",
      jsonLd: datasetJsonLd({
        name: TITLE,
        description: DESCRIPTION,
        path: "/analytics/builds",
        keywords: ["Deadlock", "hero builds", "build win rates", "best builds"],
        variableMeasured: ["win rate", "matches played", "players"],
        apiPath: "/v1/analytics/hero-build-stats/{hero_id}",
        temporalCoverage: loaderData?.coverage,
      }),
    }),
});

function BuildsPage() {
  const [heroParam, setHero] = useQueryState("hero", parseAsInteger.withDefault(DEFAULT_HERO_ID));
  const heroId = useKnownHeroId(heroParam) ?? DEFAULT_HERO_ID;
  const [buildId, setBuildId] = useQueryState("build", parseAsInteger);
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(DEFAULT_RANK_RANGE.min));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(DEFAULT_RANK_RANGE.max));
  const [minMatches, setMinMatches] = useQueryState("min_matches", parseAsInteger.withDefault(DEFAULT_MIN_MATCHES));
  const [minPlayers, setMinPlayers] = useQueryState("min_players", parseAsInteger.withDefault(DEFAULT_MIN_PLAYERS));
  const { mode: urlMode, setMode } = useModeState();
  // A Street Brawl link from another page reads as all normal matches here.
  const mode = urlMode === "street_brawl" ? DEFAULT_MODE : urlMode;
  const { startDate, endDate, handleDateChange, defaultRange } = useDateRangeState();
  const { effectiveMinRankId, effectiveMaxRankId } = getEffectiveRankRange(mode, minRankId, maxRankId);
  const [duration, setDuration] = useQueryStates({ min_duration_s: parseAsInteger, max_duration_s: parseAsInteger });
  const minDurationS = duration.min_duration_s ?? undefined;
  const maxDurationS = duration.max_duration_s ?? undefined;
  // What a build is rather than how its matches went: one update sets both tag lists.
  const [tagParams, setTagParams] = useQueryStates({
    with_tags: parseAsArrayOf(parseAsInteger).withDefault([]),
    without_tags: parseAsArrayOf(parseAsInteger).withDefault([]),
  });
  const [language, setLanguage] = useQueryState("lang", parseAsInteger);
  const [updatedDays, setUpdatedDays] = useQueryState("updated", parseAsInteger);
  const tagStates = new Map<number, TriState>([
    ...tagParams.with_tags.map((id): [number, TriState] => [id, "included"]),
    ...tagParams.without_tags.map((id): [number, TriState] => [id, "excluded"]),
  ]);
  const metaFilters = {
    withTags: tagParams.with_tags,
    withoutTags: tagParams.without_tags,
    language,
    // From the start of the day (UTC), so the server and the browser draw the same list.
    updatedSince: updatedDays === null ? null : day.utc().startOf("day").subtract(updatedDays, "day").unix(),
  };
  const facets = useBuildFacets({
    heroId,
    minRankId: effectiveMinRankId,
    maxRankId: effectiveMaxRankId,
    minDate: startDate,
    maxDate: endDate,
    minDurationS,
    maxDurationS,
    minMatches,
    minPlayers,
    matchMode: MODE_CONFIG[mode].matchMode,
  });

  return (
    <PageShell>
      <PageHeader title="Build Stats" description="How the published hero builds win when players start with them.">
        <p>
          Every Deadlock match records the hero build each player had selected when it started. This page counts those
          matches for every published build of a hero: how often it was played, by how many players, and how it won
          against the hero&apos;s other builds. For each build it shows what its players really buy and when, how
          closely they keep to its skill order, which enemy heroes it beats, and how they play against all of the
          hero&apos;s builds. Only matches with a processed replay record the build. A difference takes a color only
          where it stands out of the noise of its sample, and the gap between two win rates is in percentage points
          (pp).
        </p>
      </PageHeader>

      <Filter.Root>
        <Filter.Hero
          value={heroId}
          defaultValue={DEFAULT_HERO_ID}
          onValueChange={(id) => {
            if (id == null) return;
            startTransition(() => {
              void setHero(id, together);
              void setBuildId(null, together);
            });
          }}
        />
        <Filter.BuildId
          value={buildId}
          onValueChange={(choice) =>
            startTransition(() => {
              void setHero(choice.heroId, together);
              void setBuildId(choice.buildId, together);
            })
          }
        />
        <Filter.ModeWithRank
          value={{ mode, rank: [minRankId, maxRankId] }}
          defaultValue={{ mode: DEFAULT_MODE, rank: [DEFAULT_RANK_RANGE.min, DEFAULT_RANK_RANGE.max] }}
          modes={MODES}
          onValueChange={(next) => {
            if (next.mode !== mode) setMode(next.mode);
            if (next.rank[0] !== minRankId || next.rank[1] !== maxRankId) {
              startTransition(() => {
                void setMinRankId(next.rank[0], together);
                void setMaxRankId(next.rank[1], together);
              });
            }
          }}
        />
        <Filter.BuildTags
          tagIds={facets.tagIds}
          value={tagStates}
          onValueChange={(next) => {
            const ids = (state: TriState) => {
              const matching = [...next].filter(([, s]) => s === state).map(([id]) => id);
              return matching.length > 0 ? matching : null;
            };
            startTransition(
              () => void setTagParams({ with_tags: ids("included"), without_tags: ids("excluded") }, together),
            );
          }}
        />
        <Filter.BuildLanguage
          languages={facets.languages}
          value={language}
          onValueChange={(next) => startTransition(() => void setLanguage(next, together))}
        />
        <Filter.BuildUpdated
          value={updatedDays}
          onValueChange={(next) => startTransition(() => void setUpdatedDays(next, together))}
        />
        <Filter.MinMatches
          value={minMatches}
          onValueChange={(next) => startTransition(() => void setMinMatches(next, together))}
          defaultValue={DEFAULT_MIN_MATCHES}
        />
        <Filter.MinMatches
          label="Min Players"
          step={5}
          min={DEFAULT_MIN_PLAYERS}
          value={minPlayers}
          onValueChange={(next) => startTransition(() => void setMinPlayers(next, together))}
          defaultValue={DEFAULT_MIN_PLAYERS}
        />
        <Filter.MatchDuration
          value={[minDurationS, maxDurationS]}
          onValueChange={([min, max]) =>
            startTransition(
              () => void setDuration({ min_duration_s: min ?? null, max_duration_s: max ?? null }, together),
            )
          }
        />
        <Filter.SeasonPatchDate
          value={{ startDate, endDate }}
          onValueChange={(next) => handleDateChange(next.startDate, next.endDate, next.action)}
          defaultValue={{ startDate: defaultRange[0], endDate: defaultRange[1] }}
        />
      </Filter.Root>

      <ChunkErrorBoundary>
        <Suspense fallback={<LoadingState />}>
          <BuildsExplorer
            heroId={heroId}
            minRankId={effectiveMinRankId}
            maxRankId={effectiveMaxRankId}
            minDate={startDate}
            maxDate={endDate}
            minDurationS={minDurationS}
            maxDurationS={maxDurationS}
            minMatches={minMatches}
            minPlayers={minPlayers}
            metaFilters={metaFilters}
            matchMode={MODE_CONFIG[mode].matchMode}
            buildId={buildId}
            onBuildIdChange={(id) => void setBuildId(id)}
            onMinMatchesChange={(next) => startTransition(() => void setMinMatches(next, together))}
          />
        </Suspense>
      </ChunkErrorBoundary>
    </PageShell>
  );
}
