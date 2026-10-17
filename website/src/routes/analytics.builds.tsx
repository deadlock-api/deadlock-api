import { createFileRoute } from "@tanstack/react-router";
import { parseAsInteger, throttle, useQueryState } from "nuqs";
import { startTransition, Suspense } from "react";

import { Filter } from "~/components/domain/filters";
import { BuildsExplorer, heroBuildStatsRequest } from "~/components/features/builds/BuildsExplorer";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { ChunkErrorBoundary } from "~/components/patterns/states/ChunkErrorBoundary";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { useKnownHeroId } from "~/hooks/useAssetById";
import { useDateRangeState } from "~/hooks/useDateRangeState";
import { useModeState } from "~/hooks/useModeState";
import { DEFAULT_MATCH_MODE, DEFAULT_MODE, getEffectiveRankRange, MODE_CONFIG } from "~/lib/game-mode";
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
const TITLE = "Deadlock Build Stats: Best Hero Builds by Win Rate";
const DESCRIPTION =
  "Win rates of the published Deadlock hero builds players actually start their matches with: popularity, win rate, items and skill order of every build, by rank and patch.";

/** The hero builds analytics endpoint counts normal matches only; Street Brawl has no build to choose. */
const DISABLED_MODES = ["street_brawl"] as const;

/** A choice re-renders the page in a transition, so the tap paints first; one choice is one history entry. */
const together = { limitUrlUpdates: throttle(50) };

export const Route = createFileRoute("/analytics/builds")({
  component: BuildsPage,
  // The hero filter lives in the URL under nuqs; read it here so the loader warms the hero the page will show.
  loaderDeps: ({ search }) => {
    const heroId = (search as { hero?: unknown }).hero;
    return { heroId: typeof heroId === "number" && Number.isInteger(heroId) ? heroId : DEFAULT_HERO_ID };
  },
  loader: async ({ context: { queryClient, preferences }, deps }) => {
    const seasons = await loadSeasons(queryClient);
    const range = defaultUnixRange(seasons, preferences.dateFilter);
    const stats = await prefetchCached(
      queryClient,
      heroBuildStatsQueryOptions(
        heroBuildStatsRequest({
          heroId: deps.heroId,
          minRankId: DEFAULT_RANK_RANGE.min,
          maxRankId: DEFAULT_RANK_RANGE.max,
          ...range,
          minMatches: DEFAULT_MIN_MATCHES,
          matchMode: DEFAULT_MATCH_MODE,
        }),
      ),
    );
    // The build names are the page's content: the server waits for them so its HTML carries them.
    if (stats && typeof window === "undefined") {
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
  const { mode: urlMode, setMode } = useModeState();
  // A Street Brawl link from another page reads as all normal matches here.
  const mode = urlMode === "street_brawl" ? DEFAULT_MODE : urlMode;
  const { startDate, endDate, handleDateChange, defaultRange } = useDateRangeState();
  const { effectiveMinRankId, effectiveMaxRankId } = getEffectiveRankRange(mode, minRankId, maxRankId);

  return (
    <PageShell>
      <PageHeader title="Build Stats" description="How the published hero builds win when players start with them.">
        <p>
          Every Deadlock match records the hero build each player had selected when it started. This page counts those
          matches for every published build of a hero: how often it was played, by how many players, and how it won
          against the hero&apos;s other builds, with each build&apos;s items and skill order.
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
        <Filter.ModeWithRank
          value={{ mode, rank: [minRankId, maxRankId] }}
          defaultValue={{ mode: DEFAULT_MODE, rank: [DEFAULT_RANK_RANGE.min, DEFAULT_RANK_RANGE.max] }}
          disabledModes={DISABLED_MODES}
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
        <Filter.MinMatches
          value={minMatches}
          onValueChange={(next) => startTransition(() => void setMinMatches(next, together))}
          defaultValue={DEFAULT_MIN_MATCHES}
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
            minMatches={minMatches}
            matchMode={MODE_CONFIG[mode].matchMode}
            buildId={buildId}
            onBuildIdChange={(id) => void setBuildId(id)}
          />
        </Suspense>
      </ChunkErrorBoundary>
    </PageShell>
  );
}
