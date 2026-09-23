import { useQuery } from "@tanstack/react-query";
import { Link, type NotFoundRouteProps, createFileRoute, notFound, redirect } from "@tanstack/react-router";
import type { AnalyticsHeroStats, ItemStats } from "deadlock_api_client";
import { lazy, Suspense, useMemo } from "react";

import { NotFound } from "~/components/app/NotFound";
import { ItemImage } from "~/components/domain/assets/ItemImage";
import { ItemEffectCard } from "~/components/features/items/ItemEffectCard";
import { ItemHeroBreakdown } from "~/components/features/items/ItemHeroBreakdown";
import { ItemUpgradePath } from "~/components/features/items/ItemUpgradePath";
import { ChartLoading } from "~/components/patterns/charts/ChartStates";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Section } from "~/components/patterns/page/Section";
import { ChunkErrorBoundary } from "~/components/patterns/states/ChunkErrorBoundary";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import { Inline, Stack } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import { useSeasons } from "~/hooks/useSeasons";
import type { DateFilterPreference } from "~/lib/date-filter-preference";
import { formatPercent } from "~/lib/format";
import { DEFAULT_MATCH_MODE } from "~/lib/game-mode";
import { findItemBySlug, itemSlug } from "~/lib/item-slug";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { rankOf } from "~/lib/rank-of";
import { defaultPeriodLabel, defaultUnixRange, type SeasonInfo } from "~/lib/seasons";
import { SITE_URL, seo } from "~/lib/seo";
import { closestNameBySlug, slugify } from "~/lib/slug";
import { filterShopableItems, itemQueryOptions, itemUpgradesQueryOptions, loadSeasons } from "~/queries/asset-queries";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";

const ItemWinRateOverTime = lazy(() =>
  import("~/components/features/items/ItemWinRateOverTime").then((m) => ({ default: m.ItemWinRateOverTime })),
);

const ItemWinRateByRank = lazy(() =>
  import("~/components/features/items/ItemWinRateByRank").then((m) => ({ default: m.ItemWinRateByRank })),
);

const ItemWinRateByBuyTime = lazy(() =>
  import("~/components/features/items/ItemWinRateByBuyTime").then((m) => ({ default: m.ItemWinRateByBuyTime })),
);

const DEFAULT_MIN_RANK = 91;
const DEFAULT_MAX_RANK = 116;
const GAME_MODE = "normal" as const;

const SLOT_LABEL = { weapon: "Weapon", spirit: "Spirit", vitality: "Vitality" } as const;

// Mirrors the items page's default request so both pages share one cache entry.
function currentItemStatsParams(seasons: readonly SeasonInfo[], preference: DateFilterPreference = "season") {
  return {
    minMatches: 10,
    heroId: null,
    minAverageBadge: DEFAULT_MIN_RANK,
    maxAverageBadge: DEFAULT_MAX_RANK,
    minBoughtAtS: undefined,
    maxBoughtAtS: undefined,
    gameMode: GAME_MODE,
    matchMode: DEFAULT_MATCH_MODE,
    ...defaultUnixRange(seasons, preference),
  };
}

function byRankItemStatsParams(seasons: readonly SeasonInfo[], preference: DateFilterPreference = "season") {
  return {
    minMatches: 10,
    gameMode: GAME_MODE,
    matchMode: DEFAULT_MATCH_MODE,
    ...defaultUnixRange(seasons, preference),
  };
}

function currentHeroStatsParams(seasons: readonly SeasonInfo[], preference: DateFilterPreference = "season") {
  return {
    minHeroMatches: 0,
    minHeroMatchesTotal: 0,
    minAverageBadge: DEFAULT_MIN_RANK,
    maxAverageBadge: DEFAULT_MAX_RANK,
    gameMode: GAME_MODE,
    matchMode: DEFAULT_MATCH_MODE,
    ...defaultUnixRange(seasons, preference),
  };
}

function summarizeItemStats(
  rows: readonly ItemStats[] | undefined,
  heroRows: readonly AnalyticsHeroStats[] | undefined,
  itemId: number,
) {
  if (!rows || rows.length === 0) return null;
  const row = rows.find((r) => r.item_id === itemId);
  if (!row || row.matches === 0) return null;
  let playerMatches = 0;
  for (const hero of heroRows ?? []) playerMatches += hero.matches;
  return {
    winRate: row.wins / row.matches,
    winRateRank: rankOf(
      row.wins / row.matches,
      rows.map((r) => r.wins / r.matches),
    ),
    itemCount: rows.length,
    matches: row.matches,
    players: row.players,
    usage: playerMatches > 0 ? row.matches / playerMatches : undefined,
    avgBuyTimeS: row.avg_buy_time_s,
  };
}

export const Route = createFileRoute("/analytics/items/$itemName")({
  component: ItemDetailPage,
  loader: async ({ context: { queryClient, preferences }, params }) => {
    const [items, seasons] = await Promise.all([
      queryClient.ensureQueryData(itemUpgradesQueryOptions),
      loadSeasons(queryClient),
    ]);
    const shopable = filterShopableItems(items);
    const item = findItemBySlug(shopable, params.itemName);
    if (!item) {
      // "Extra_Health" names an item exactly once normalized: send it to its canonical address.
      const canonical = findItemBySlug(shopable, slugify(params.itemName));
      if (canonical) {
        throw redirect({
          to: "/analytics/items/$itemName",
          params: { itemName: itemSlug(canonical.name) },
          statusCode: 301,
        });
      }
      throw notFound({ data: { suggestion: closestNameBySlug(shopable, params.itemName)?.name } });
    }
    const [stats, heroStats] = await Promise.all([
      prefetchSafe(
        queryClient.ensureQueryData(itemStatsQueryOptions(currentItemStatsParams(seasons, preferences.dateFilter))),
      ),
      prefetchSafe(
        queryClient.ensureQueryData(heroStatsQueryOptions(currentHeroStatsParams(seasons, preferences.dateFilter))),
      ),
      prefetchSafe(queryClient.ensureQueryData(itemQueryOptions(item.id))),
    ]);
    const summary = summarizeItemStats(stats, heroStats, item.id);
    return {
      itemId: item.id,
      itemName: item.name,
      slug: params.itemName,
      image: item.shop_image_webp ?? item.shop_image ?? null,
      tier: item.item_tier,
      slot: SLOT_LABEL[item.item_slot_type],
      cost: item.cost ?? null,
      breadcrumb: item.name,
      summary: summary && {
        winRate: summary.winRate,
        rank: summary.winRateRank,
        itemCount: summary.itemCount,
        usage: summary.usage,
      },
    };
  },
  notFoundComponent: ItemNotFound,
  head: ({ loaderData }) => {
    if (!loaderData) {
      return seo({
        title: "Item Not Found | Deadlock",
        description: "The requested Deadlock item could not be found.",
        path: "/analytics/items",
      });
    }
    const { itemName, slug, image, tier, slot, summary } = loaderData;
    const url = `${SITE_URL}/analytics/items/${slug}`;
    const usage = summary?.usage !== undefined ? ` and shows up in ${formatPercent(summary.usage)} of builds` : "";
    const description = summary
      ? `${itemName} wins ${formatPercent(summary.winRate)} of Deadlock matches (#${summary.rank} of ${summary.itemCount} items)${usage}. Best heroes, common pairings, and buy timing, updated daily.`
      : `${itemName} win rate, best heroes, common pairings, and buy timing in Deadlock. Live stats from tracked matches, updated daily.`;
    return seo({
      title: `${itemName} Win Rate & Best Heroes | Deadlock`,
      description,
      path: `/analytics/items/${slug}`,
      ogImage: image ?? undefined,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: `${itemName} Win Rate & Best Heroes | Deadlock`,
        description: `Win rate, purchase rate, buy timing, best heroes, and common pairings for the tier ${tier} ${slot} item ${itemName} in Deadlock, calculated from tracked matches and updated daily.`,
        url,
        keywords: ["Deadlock", itemName, "item", "win rate", "build"],
        creator: { "@type": "Organization", name: "Deadlock API", url: SITE_URL },
        isAccessibleForFree: true,
        license: "https://github.com/deadlock-api/deadlock-api/blob/master/LICENSE",
      },
    });
  },
});

function clock(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function ItemDetailPage() {
  const { preferences } = Route.useRouteContext();
  const { itemId, itemName, tier, slot, cost } = Route.useLoaderData();
  const { seasons } = useSeasons();
  const period = defaultPeriodLabel(seasons, preferences.dateFilter);
  const itemRequest = currentItemStatsParams(seasons, preferences.dateFilter);
  const heroRequest = currentHeroStatsParams(seasons, preferences.dateFilter);
  const statsQuery = useQuery(itemStatsQueryOptions(itemRequest));
  const heroStatsQuery = useQuery(heroStatsQueryOptions(heroRequest));
  const itemQuery = useQuery(itemQueryOptions(itemId));

  const summary = useMemo(
    () => summarizeItemStats(statsQuery.data, heroStatsQuery.data, itemId),
    [statsQuery.data, heroStatsQuery.data, itemId],
  );

  const facts = [`Tier ${tier}`, slot, cost !== null && `${cost.toLocaleString("en-US")} souls`].filter(Boolean);

  return (
    <PageShell density="data">
      <PageHeader
        title={`${itemName}: Deadlock Win Rate & Best Heroes`}
        description={facts.join(" · ")}
        media={<ItemImage itemId={itemId} className="size-16" />}
      />

      {summary ? (
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {period === "this season" ? "This season" : "In the current patch"}, players who buy {itemName} win{" "}
          <span className="font-semibold text-foreground">{formatPercent(summary.winRate)}</span> of their{" "}
          <span className="font-semibold text-foreground">{summary.matches.toLocaleString("en-US")}</span> tracked
          matches
          {summary.usage !== undefined && (
            <>
              , and it shows up in <span className="font-semibold text-foreground">{formatPercent(summary.usage)}</span>{" "}
              of all builds
            </>
          )}
          . Numbers are drawn from live match data and refreshed daily.
        </p>
      ) : (
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Live win rate, purchase rate, and hero statistics for {itemName} in Deadlock, drawn from tracked matches and
          updated daily.
        </p>
      )}

      {summary && (
        <StatGroup variant="tiles" className="grid-cols-2 sm:grid-cols-4">
          <Stat
            label="Win Rate"
            value={formatPercent(summary.winRate)}
            sub={`#${summary.winRateRank} of ${summary.itemCount} items`}
          />
          <Stat
            label="Bought"
            value={summary.usage !== undefined ? formatPercent(summary.usage) : "—"}
            sub={`by ${summary.players.toLocaleString("en-US")} players`}
          />
          <Stat label="Matches" value={summary.matches.toLocaleString("en-US")} />
          <Stat label="Avg Buy Time" value={clock(summary.avgBuyTimeS)} sub="into the match" />
        </StatGroup>
      )}

      {/* The summary and the sections below read these stats; a failure would otherwise leave only the header. */}
      {!summary && (statsQuery.isError || heroStatsQuery.isError) && (
        <ErrorState
          title={`${itemName} stats did not load`}
          onRetry={() => void Promise.all([statsQuery.refetch(), heroStatsQuery.refetch()])}
        />
      )}

      {itemQuery.data && (itemQuery.data.tooltip_sections?.length ?? 0) > 0 && (
        <Section title={`What ${itemName} Does`}>
          <Card size="sm" className="max-w-3xl p-4">
            <ItemEffectCard item={itemQuery.data} />
          </Card>
        </Section>
      )}

      <ItemUpgradePath itemId={itemId} itemName={itemName} request={itemRequest} />

      <ItemHeroBreakdown itemId={itemId} itemName={itemName} itemRequest={itemRequest} heroRequest={heroRequest} />

      <ChunkErrorBoundary>
        <Suspense fallback={<ChartLoading label={`${itemName} win rate over time`} />}>
          <ItemWinRateOverTime
            itemId={itemId}
            itemName={itemName}
            itemRequest={itemRequest}
            heroRequest={heroRequest}
          />
        </Suspense>
      </ChunkErrorBoundary>

      <ChunkErrorBoundary>
        <Suspense fallback={<ChartLoading label={`${itemName} win rate by rank`} />}>
          <ItemWinRateByRank
            itemId={itemId}
            itemName={itemName}
            request={byRankItemStatsParams(seasons, preferences.dateFilter)}
          />
        </Suspense>
      </ChunkErrorBoundary>

      <ChunkErrorBoundary>
        <Suspense fallback={<ChartLoading label={`${itemName} win rate by purchase time`} />}>
          <ItemWinRateByBuyTime itemId={itemId} itemName={itemName} request={itemRequest} />
        </Suspense>
      </ChunkErrorBoundary>

      <Stack gap={4}>
        <Separator />
        <Inline asChild gap={4} className="text-sm">
          <nav aria-label="Related pages">
            <Button asChild variant="link" size="inline">
              <Link to="/analytics/items" search={{ include_items: itemId }} preload="intent">
                Builds with {itemName}
              </Link>
            </Button>
            <Button asChild variant="link" size="inline">
              <Link to="/analytics/items" preload="intent">
                All item win rates
              </Link>
            </Button>
          </nav>
        </Inline>
      </Stack>
    </PageShell>
  );
}

function ItemNotFound({ data }: NotFoundRouteProps) {
  const suggestion = (data as { suggestion?: string } | undefined)?.suggestion;
  return (
    <NotFound
      didYouMean={
        suggestion && (
          <Link to="/analytics/items/$itemName" params={{ itemName: itemSlug(suggestion) }}>
            {suggestion}
          </Link>
        )
      }
    />
  );
}
