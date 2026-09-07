import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { AnalyticsApiItemStatsRequest, Upgrade } from "deadlock_api_client";
import { useMemo } from "react";

import { ItemImageFromAsset } from "~/components/ItemImage";
import { LoadingLogo } from "~/components/LoadingLogo";
import { wilsonScoreInterval } from "~/lib/wilson";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";

const TOP_ITEM_COUNT = 8;
/** Items bought in fewer of the hero's matches than this are too rare for the ranking to mean much. */
const MIN_USAGE = 0.05;

interface TopItem {
  item: Upgrade;
  winRate: number;
  usage: number;
  matches: number;
}

/** Ranks by the Wilson lower bound so a few lucky matches can't put a rarely bought item on top. */
function pickTopItems(
  stats: readonly { item_id: number; wins: number; matches: number }[],
  items: readonly Upgrade[],
  heroMatches: number,
): TopItem[] {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  return stats
    .flatMap((row) => {
      const item = itemsById.get(row.item_id);
      if (!item || row.matches < heroMatches * MIN_USAGE) return [];
      const [lowerBound] = wilsonScoreInterval(row.wins, row.matches);
      return [
        { item, winRate: row.wins / row.matches, usage: row.matches / heroMatches, matches: row.matches, lowerBound },
      ];
    })
    .sort((a, b) => b.lowerBound - a.lowerBound)
    .slice(0, TOP_ITEM_COUNT);
}

export function HeroTopItems({
  heroId,
  heroName,
  heroMatches,
  request,
}: {
  heroId: number;
  heroName: string;
  heroMatches: number;
  request: Omit<AnalyticsApiItemStatsRequest, "heroId">;
}) {
  const statsQuery = useQuery(itemStatsQueryOptions({ ...request, heroId }));
  const itemsQuery = useQuery(itemUpgradesQueryOptions);

  const topItems = useMemo(
    () => (statsQuery.data && itemsQuery.data ? pickTopItems(statsQuery.data, itemsQuery.data, heroMatches) : null),
    [statsQuery.data, itemsQuery.data, heroMatches],
  );

  if (statsQuery.isError) return null;
  if (!topItems) return <LoadingLogo />;
  if (topItems.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">Best {heroName} Items</h2>
      <p className="text-sm text-muted-foreground">
        The items that most reliably win on {heroName}, ranked by the lower bound of their win rate's confidence
        interval so a handful of lucky matches can't carry an item to the top.
      </p>
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {topItems.map(({ item, winRate, usage, matches }, index) => (
          <li
            key={item.id}
            className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card px-3 py-3 text-center"
            title={`${item.name}: ${matches.toLocaleString("en-US")} matches`}
          >
            <span className="text-xs font-medium text-muted-foreground tabular-nums">#{index + 1}</span>
            <ItemImageFromAsset item={item} className="size-12 rounded" />
            <span className="text-sm leading-tight font-medium">{item.name}</span>
            <dl className="mt-auto w-full space-y-0.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Win</dt>
                <dd className="font-semibold tabular-nums">{(winRate * 100).toFixed(1)}%</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Bought</dt>
                <dd className="tabular-nums">{(usage * 100).toFixed(0)}%</dd>
              </div>
            </dl>
          </li>
        ))}
      </ol>
      <Link
        to="/items"
        search={{ hero: heroId }}
        preload="intent"
        className="inline-block text-sm font-medium text-primary underline underline-offset-4"
      >
        All {heroName} item stats
      </Link>
    </section>
  );
}
