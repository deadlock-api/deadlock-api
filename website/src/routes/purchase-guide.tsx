import { createFileRoute } from "@tanstack/react-router";
import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { lazy, Suspense } from "react";

import { ChunkErrorBoundary } from "~/components/ChunkErrorBoundary";
import { Filter } from "~/components/Filter";
import { LoadingLogo } from "~/components/LoadingLogo";
import type { PurchaseGuideSort } from "~/components/purchase-guide/PurchaseGuide";
import { parseAsGameMode } from "~/components/selectors/GameModeSelector";
import { StringSelector } from "~/components/selectors/StringSelector";
import { DEFAULT_DATE_RANGE } from "~/lib/constants";
import { getEffectiveRankRange } from "~/lib/game-mode";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { seo } from "~/lib/seo";
import { normalizeUnixCeil, normalizeUnixFloor } from "~/lib/time-normalize";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";

const PurchaseGuide = lazy(() =>
  import("~/components/purchase-guide/PurchaseGuide").then((module) => ({ default: module.PurchaseGuide })),
);

const parseAsPurchaseGuideSort = parseAsStringLiteral(["pick_rate", "best_window"] as const).withDefault("pick_rate");

export const Route = createFileRoute("/purchase-guide")({
  component: PurchaseGuidePage,
  loader: async ({ context: { queryClient } }) => {
    const common = {
      heroId: 12,
      minAverageBadge: 106,
      maxAverageBadge: 116,
      minUnixTimestamp: normalizeUnixFloor(DEFAULT_DATE_RANGE[0]) ?? 0,
      maxUnixTimestamp: normalizeUnixCeil(DEFAULT_DATE_RANGE[1]),
      gameMode: "normal" as const,
    };
    await Promise.all([
      prefetchSafe(queryClient.ensureQueryData(itemStatsQueryOptions({ ...common, minMatches: 10 }))),
      prefetchSafe(
        queryClient.ensureQueryData(itemStatsQueryOptions({ ...common, bucket: "net_worth_by_1000", minMatches: 2 })),
      ),
    ]);
  },
  head: () =>
    seo({
      title: "Deadlock Purchase Guide: Best Item Buy Windows",
      description: "A tiered Deadlock item guide showing statistically supported net-worth windows for item purchases.",
      path: "/purchase-guide",
    }),
});

function PurchaseGuidePage() {
  const [gameMode, setGameMode] = useQueryState("game_mode", parseAsGameMode);
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(106));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(116));
  const [hero, setHero] = useQueryState("hero", parseAsInteger.withDefault(12));
  const [minMatches, setMinMatches] = useQueryState("min_matches", parseAsInteger.withDefault(10));
  const [sort, setSort] = useQueryState("sort", parseAsPurchaseGuideSort);
  const [[startDate, endDate], setDateRange] = useQueryState(
    "date_range",
    parseAsDayjsRange.withDefault(DEFAULT_DATE_RANGE),
  );
  const { effectiveMinRankId, effectiveMaxRankId } = getEffectiveRankRange(gameMode, minRankId, maxRankId);

  const sortLabel = sort === "best_window" ? "Best Window" : "Pick Rate";

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Item Purchase Guide</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tiered item recommendations with the best supported net-worth windows
        </p>
      </div>

      <Filter.Root>
        <Filter.Hero value={hero} onChange={setHero} />
        <Filter.MinMatches value={minMatches} onChange={setMinMatches} />
        <Filter.GameModeWithRank
          gameMode={gameMode}
          onGameModeChange={setGameMode}
          minRank={minRankId}
          maxRank={maxRankId}
          onRankChange={(min, max) => {
            setMinRankId(min);
            setMaxRankId(max);
          }}
        />
        <Filter.PatchOrDate
          startDate={startDate}
          endDate={endDate}
          onDateChange={(start, end) => setDateRange([start, end])}
        />
        <Filter.SortBy label={sortLabel}>
          <StringSelector
            label="Sort"
            selected={sort}
            defaultValue="pick_rate"
            options={[
              { value: "pick_rate", label: "Pick Rate" },
              { value: "best_window", label: "Best Window" },
            ]}
            onSelect={(value) => setSort(value as PurchaseGuideSort)}
          />
        </Filter.SortBy>
      </Filter.Root>

      <div className="mx-auto max-w-5xl">
        <ChunkErrorBoundary>
          <Suspense fallback={<LoadingLogo />}>
            <PurchaseGuide
              minRankId={effectiveMinRankId}
              maxRankId={effectiveMaxRankId}
              minDate={startDate}
              maxDate={endDate}
              hero={hero}
              minMatches={minMatches}
              gameMode={gameMode}
              sort={sort}
            />
          </Suspense>
        </ChunkErrorBoundary>
      </div>
    </div>
  );
}
