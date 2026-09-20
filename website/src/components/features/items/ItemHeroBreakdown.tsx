import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiHeroStatsRequest, AnalyticsApiItemStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import { RankedEntityCard, RankedEntityGrid } from "~/components/domain/assets/RankedEntityGrid";
import { Section } from "~/components/patterns/page/Section";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { KeyValue } from "~/components/ui/key-value";
import { formatPercent, formatShare } from "~/lib/format";
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
  if (!breakdown) return <LoadingState label={`${itemName} hero breakdown`} />;

  return (
    <>
      {breakdown.heroes.length > 0 && (
        <Section
          title={`Best Heroes for ${itemName}`}
          description={
            <>
              The heroes that win most reliably after buying {itemName}, ranked by the lower bound of their win rate's
              confidence interval. "Bought" is how often the hero picks it up.
            </>
          }
        >
          <RankedEntityGrid>
            {breakdown.heroes.map(({ heroId, winRate, usage, matches }, index) => (
              <RankedEntityCard
                key={heroId}
                rank={index + 1}
                entity={{ heroId }}
                title={`${matches.toLocaleString("en-US")} matches`}
              >
                <KeyValue label="Win" value={formatPercent(winRate)} />
                <KeyValue label="Bought" value={formatShare(usage)} />
              </RankedEntityCard>
            ))}
          </RankedEntityGrid>
        </Section>
      )}

      {breakdown.paired.length > 0 && (
        <Section
          title={`Often Built with ${itemName}`}
          description={
            <>
              The items that most often share a build with {itemName}. "Together" is how many {itemName} buyers also
              bought the item, and the win rate counts only builds with both.
            </>
          }
        >
          <RankedEntityGrid>
            {breakdown.paired.map(({ item, winRate, pairRate }, index) => (
              <RankedEntityCard key={item.id} rank={index + 1} entity={{ itemId: item.id }}>
                <KeyValue label="Win" value={formatPercent(winRate)} />
                <KeyValue label="Together" value={formatShare(pairRate)} />
              </RankedEntityCard>
            ))}
          </RankedEntityGrid>
        </Section>
      )}
    </>
  );
}
