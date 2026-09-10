import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import type { AnalyticsHeroStats, ItemStats } from "deadlock_api_client";
import { lazy, Suspense, useMemo } from "react";

import { ChunkErrorBoundary } from "~/components/ChunkErrorBoundary";
import { ItemImage } from "~/components/ItemImage";
import { ItemEffectCard } from "~/components/items-page/ItemEffectCard";
import { LoadingLogo } from "~/components/LoadingLogo";
import { DEFAULT_MATCH_MODE } from "~/components/selectors/MatchModeSelector";
import { StatCard } from "~/components/StatCard";
import { useSeasons } from "~/hooks/useSeasons";
import { formatPercent } from "~/lib/format";
import { findItemBySlug } from "~/lib/item-slug";
import { prefetchSafe } from "~/lib/prefetch-safe";
import { rankOf } from "~/lib/rank-of";
import { type SeasonInfo, defaultUnixRange } from "~/lib/seasons";
import { SITE_URL, seo } from "~/lib/seo";
import { filterShopableItems, itemQueryOptions, itemUpgradesQueryOptions, loadSeasons } from "~/queries/asset-queries";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";

const ItemHeroBreakdown = lazy(() =>
  import("~/components/items-page/ItemHeroBreakdown").then((m) => ({ default: m.ItemHeroBreakdown })),
);

const ItemWinRateByBuyTime = lazy(() =>
  import("~/components/items-page/ItemWinRateByBuyTime").then((m) => ({ default: m.ItemWinRateByBuyTime })),
);

const DEFAULT_MIN_RANK = 91;
const DEFAULT_MAX_RANK = 116;
const GAME_MODE = "normal" as const;

const SLOT_LABEL = { weapon: "Weapon", spirit: "Spirit", vitality: "Vitality" } as const;

// Mirrors the items page's default request so both pages share one cache entry.
function currentItemStatsParams(seasons: readonly SeasonInfo[]) {
  return {
    minMatches: 10,
    heroId: null,
    minAverageBadge: DEFAULT_MIN_RANK,
    maxAverageBadge: DEFAULT_MAX_RANK,
    minBoughtAtS: undefined,
    maxBoughtAtS: undefined,
    gameMode: GAME_MODE,
    matchMode: DEFAULT_MATCH_MODE,
    ...defaultUnixRange(seasons),
  };
}

function currentHeroStatsParams(seasons: readonly SeasonInfo[]) {
  return {
    minHeroMatches: 0,
    minHeroMatchesTotal: 0,
    minAverageBadge: DEFAULT_MIN_RANK,
    maxAverageBadge: DEFAULT_MAX_RANK,
    gameMode: GAME_MODE,
    matchMode: DEFAULT_MATCH_MODE,
    ...defaultUnixRange(seasons),
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

export const Route = createFileRoute("/items/$itemName")({
  component: ItemDetailPage,
  loader: async ({ context: { queryClient }, params }) => {
    const [items, seasons] = await Promise.all([
      queryClient.ensureQueryData(itemUpgradesQueryOptions),
      loadSeasons(queryClient),
    ]);
    const item = findItemBySlug(filterShopableItems(items), params.itemName);
    if (!item) throw notFound();
    const [stats, heroStats] = await Promise.all([
      prefetchSafe(queryClient.ensureQueryData(itemStatsQueryOptions(currentItemStatsParams(seasons)))),
      prefetchSafe(queryClient.ensureQueryData(heroStatsQueryOptions(currentHeroStatsParams(seasons)))),
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
  head: ({ loaderData }) => {
    if (!loaderData) {
      return seo({
        title: "Item Not Found | Deadlock",
        description: "The requested Deadlock item could not be found.",
        path: "/items",
      });
    }
    const { itemName, slug, image, tier, slot, summary } = loaderData;
    const url = `${SITE_URL}/items/${slug}`;
    const usage = summary?.usage !== undefined ? ` and shows up in ${formatPercent(summary.usage)} of builds` : "";
    const description = summary
      ? `${itemName} wins ${formatPercent(summary.winRate)} of Deadlock ranked matches (#${summary.rank} of ${summary.itemCount} items)${usage}. Best heroes, common pairings, and buy timing, updated daily.`
      : `${itemName} win rate, best heroes, common pairings, and buy timing in Deadlock. Live stats from tracked ranked matches, updated daily.`;
    return seo({
      title: `${itemName} Win Rate & Best Heroes | Deadlock`,
      description,
      path: `/items/${slug}`,
      ogImage: image ?? undefined,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: `${itemName} Win Rate & Best Heroes | Deadlock`,
        description: `Win rate, purchase rate, buy timing, best heroes, and common pairings for the tier ${tier} ${slot} item ${itemName} in Deadlock, calculated from tracked ranked matches and updated daily.`,
        url,
        keywords: ["Deadlock", itemName, "item", "win rate", "build"],
        creator: { "@type": "Organization", name: "Deadlock API", url: SITE_URL },
        isAccessibleForFree: true,
        license: "https://github.com/deadlock-api/",
      },
    });
  },
});

function clock(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function ItemDetailPage() {
  const { itemId, itemName, tier, slot, cost } = Route.useLoaderData();
  const { seasons } = useSeasons();
  const itemRequest = currentItemStatsParams(seasons);
  const heroRequest = currentHeroStatsParams(seasons);
  const statsQuery = useQuery(itemStatsQueryOptions(itemRequest));
  const heroStatsQuery = useQuery(heroStatsQueryOptions(heroRequest));
  const itemQuery = useQuery(itemQueryOptions(itemId));

  const summary = useMemo(
    () => summarizeItemStats(statsQuery.data, heroStatsQuery.data, itemId),
    [statsQuery.data, heroStatsQuery.data, itemId],
  );

  const facts = [`Tier ${tier}`, slot, cost !== null && `${cost.toLocaleString("en-US")} souls`].filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <ItemImage itemId={itemId} className="size-16 rounded-lg" />
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">{itemName}: Deadlock Win Rate &amp; Best Heroes</h1>
          <p className="mt-1 text-sm text-muted-foreground">{facts.join(" · ")}</p>
        </div>
      </div>

      {summary ? (
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          In the current patch, players who buy {itemName} win{" "}
          <span className="font-semibold text-foreground">{formatPercent(summary.winRate)}</span> of their{" "}
          <span className="font-semibold text-foreground">{summary.matches.toLocaleString("en-US")}</span> tracked
          ranked matches
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
          Live win rate, purchase rate, and hero statistics for {itemName} in Deadlock, drawn from tracked ranked
          matches and updated daily.
        </p>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Win Rate"
            value={formatPercent(summary.winRate)}
            sub={`#${summary.winRateRank} of ${summary.itemCount} items`}
          />
          <StatCard
            label="Bought"
            value={summary.usage !== undefined ? formatPercent(summary.usage) : "—"}
            sub={`by ${summary.players.toLocaleString("en-US")} players`}
          />
          <StatCard label="Matches" value={summary.matches.toLocaleString("en-US")} />
          <StatCard label="Avg Buy Time" value={clock(summary.avgBuyTimeS)} sub="into the match" />
        </div>
      )}

      {itemQuery.data && (itemQuery.data.tooltip_sections?.length ?? 0) > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">What {itemName} Does</h2>
          <ItemEffectCard item={itemQuery.data} className="max-w-3xl rounded-lg border border-border bg-card p-4" />
        </section>
      )}

      <ChunkErrorBoundary>
        <Suspense fallback={<LoadingLogo />}>
          <ItemHeroBreakdown itemId={itemId} itemName={itemName} itemRequest={itemRequest} heroRequest={heroRequest} />
        </Suspense>
      </ChunkErrorBoundary>

      <ChunkErrorBoundary>
        <Suspense fallback={<LoadingLogo />}>
          <ItemWinRateByBuyTime itemId={itemId} itemName={itemName} request={itemRequest} />
        </Suspense>
      </ChunkErrorBoundary>

      <nav aria-label="Related pages" className="flex flex-wrap gap-4 border-t border-border pt-4 text-sm">
        <Link
          to="/items"
          search={{ include_items: itemId }}
          preload="intent"
          className="font-medium text-primary underline underline-offset-4"
        >
          Builds with {itemName}
        </Link>
        <Link to="/items" preload="intent" className="font-medium text-primary underline underline-offset-4">
          All item win rates
        </Link>
      </nav>
    </div>
  );
}
