import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { AnalyticsApiHeroStatsRequest, AnalyticsApiItemStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { ItemImageFromAsset } from "~/components/ItemImage";
import { LoadingLogo } from "~/components/LoadingLogo";
import { itemSlug } from "~/lib/item-slug";
import { wilsonScoreInterval } from "~/lib/wilson";
import { filterShopableItems, itemUpgradesQueryOptions, type SlimUpgrade } from "~/queries/asset-queries";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";

const TOP_COUNT = 8;
/** Heroes with fewer purchases than this have too few games for the ranking to mean much. */
const MIN_HERO_MATCHES = 30;

interface CohortRow {
  item_id: number;
  bucket: number;
  wins: number;
  matches: number;
}

interface HeroEntry {
  heroId: number;
  winRate: number;
  usage: number;
  matches: number;
}

interface PairedItem {
  item: SlimUpgrade;
  winRate: number;
  pairRate: number;
}

/** Ranks by the Wilson lower bound so a few lucky matches can't put a rarely picked hero on top. */
function pickTopHeroes(rows: readonly CohortRow[], itemId: number, heroMatches: Map<number, number>): HeroEntry[] {
  return rows
    .flatMap((row) => {
      const total = heroMatches.get(row.bucket);
      if (row.item_id !== itemId || row.matches < MIN_HERO_MATCHES || !total) return [];
      const [lowerBound] = wilsonScoreInterval(row.wins, row.matches);
      return [
        {
          heroId: row.bucket,
          winRate: row.wins / row.matches,
          usage: row.matches / total,
          matches: row.matches,
          lowerBound,
        },
      ];
    })
    .sort((a, b) => b.lowerBound - a.lowerBound)
    .slice(0, TOP_COUNT);
}

/**
 * Items most often in the same build as `item`. Its own components and upgrades are skipped: buying
 * the item implies buying those, so they would trivially top the list.
 */
function pickPairedItems(rows: readonly CohortRow[], item: SlimUpgrade, items: readonly SlimUpgrade[]): PairedItem[] {
  const totals = new Map<number, { wins: number; matches: number }>();
  for (const row of rows) {
    const acc = totals.get(row.item_id) ?? { wins: 0, matches: 0 };
    acc.wins += row.wins;
    acc.matches += row.matches;
    totals.set(row.item_id, acc);
  }
  const own = totals.get(item.id);
  if (!own || own.matches === 0) return [];
  const components = new Set(item.component_items ?? []);
  return items
    .flatMap((other) => {
      const acc = totals.get(other.id);
      if (!acc || other.id === item.id) return [];
      if (components.has(other.class_name) || other.component_items?.includes(item.class_name)) return [];
      return [{ item: other, winRate: acc.wins / acc.matches, pairRate: acc.matches / own.matches }];
    })
    .sort((a, b) => b.pairRate - a.pairRate)
    .slice(0, TOP_COUNT);
}

function Percent({ value, digits = 1 }: { value: number; digits?: number }) {
  return <>{(value * 100).toFixed(digits)}%</>;
}

export function ItemHeroBreakdown({
  itemId,
  itemName,
  itemRequest,
  heroRequest,
}: {
  itemId: number;
  itemName: string;
  itemRequest: AnalyticsApiItemStatsRequest;
  heroRequest: AnalyticsApiHeroStatsRequest;
}) {
  const cohortQuery = useQuery(itemStatsQueryOptions({ ...itemRequest, bucket: "hero", includeItemIds: [itemId] }));
  const heroStatsQuery = useQuery(heroStatsQueryOptions(heroRequest));
  const itemsQuery = useQuery(itemUpgradesQueryOptions);

  const breakdown = useMemo(() => {
    const items = itemsQuery.data;
    const item = items?.find((candidate) => candidate.id === itemId);
    if (!cohortQuery.data || !heroStatsQuery.data || !items || !item) return null;
    const heroMatches = new Map(heroStatsQuery.data.map((row) => [row.hero_id, row.matches]));
    return {
      heroes: pickTopHeroes(cohortQuery.data, itemId, heroMatches),
      paired: pickPairedItems(cohortQuery.data, item, filterShopableItems(items)),
    };
  }, [cohortQuery.data, heroStatsQuery.data, itemsQuery.data, itemId]);

  if (cohortQuery.isError || heroStatsQuery.isError) return null;
  if (!breakdown) return <LoadingLogo />;

  return (
    <>
      {breakdown.heroes.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Best Heroes for {itemName}</h2>
          <p className="text-sm text-muted-foreground">
            The heroes that win most reliably after buying {itemName}, ranked by the lower bound of their win rate's
            confidence interval. "Bought" is how often the hero picks it up.
          </p>
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {breakdown.heroes.map(({ heroId, winRate, usage, matches }, index) => (
              <li
                key={heroId}
                className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card px-3 py-3 text-center"
                title={`${matches.toLocaleString("en-US")} matches`}
              >
                <span className="text-xs font-medium text-muted-foreground tabular-nums">#{index + 1}</span>
                <HeroImage heroId={heroId} className="size-12 rounded-full" />
                <HeroName heroId={heroId} linkToDetail className="text-sm leading-tight font-medium" />
                <dl className="mt-auto w-full space-y-0.5 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Win</dt>
                    <dd className="font-semibold tabular-nums">
                      <Percent value={winRate} />
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Bought</dt>
                    <dd className="tabular-nums">
                      <Percent value={usage} digits={0} />
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        </section>
      )}

      {breakdown.paired.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Often Built with {itemName}</h2>
          <p className="text-sm text-muted-foreground">
            The items that most often share a build with {itemName}. "Together" is how many {itemName} buyers also
            bought the item, and the win rate counts only builds with both.
          </p>
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {breakdown.paired.map(({ item, winRate, pairRate }, index) => (
              <li
                key={item.id}
                className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card px-3 py-3 text-center"
              >
                <span className="text-xs font-medium text-muted-foreground tabular-nums">#{index + 1}</span>
                <ItemImageFromAsset item={item} className="size-12 rounded" />
                <Link
                  to="/items/$itemName"
                  params={{ itemName: itemSlug(item.name) }}
                  preload="intent"
                  className="text-sm leading-tight font-medium hover:underline"
                >
                  {item.name}
                </Link>
                <dl className="mt-auto w-full space-y-0.5 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Win</dt>
                    <dd className="font-semibold tabular-nums">
                      <Percent value={winRate} />
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Together</dt>
                    <dd className="tabular-nums">
                      <Percent value={pairRate} digits={0} />
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
