import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiItemStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import { RankedEntityCard, RankedEntityGrid } from "~/components/domain/assets/RankedEntityGrid";
import { Section } from "~/components/patterns/page/Section";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { KeyValue } from "~/components/ui/key-value";
import { buildComponentImplications } from "~/lib/build-transform";
import { formatPercent, formatShare, possessive } from "~/lib/format";
import type { ItemBestHero } from "~/lib/item-hero-fns";
import { filterShopableItems, itemUpgradesQueryOptions, type SlimUpgrade } from "~/queries/asset-queries";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";

const TOP_COUNT = 8;

interface CohortRow {
  item_id: number;
  bucket: number;
  wins: number;
  matches: number;
}

interface PairedItem {
  item: SlimUpgrade;
  winRate: number;
  pairRate: number;
}

/**
 * Items most often in the same build as `item`. Its components and upgrades are skipped, the whole tree of them (a T4's
 * T1 component too, not just the T2 it builds from): buying the item implies buying those, so they would trivially
 * top the list.
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
  const implied = buildComponentImplications([...items]);
  const components = new Set(implied.get(item.id));
  return items
    .flatMap((other) => {
      const acc = totals.get(other.id);
      if (!acc || other.id === item.id) return [];
      if (components.has(other.id) || implied.get(other.id)?.includes(item.id)) return [];
      return [{ item: other, winRate: acc.wins / acc.matches, pairRate: acc.matches / own.matches }];
    })
    .sort((a, b) => b.pairRate - a.pairRate)
    .slice(0, TOP_COUNT);
}

/**
 * `bestHeroes` comes from the page loader (`fetchItemBestHeroes`), so it is in the server HTML; undefined when it failed.
 * The pairings need the whole cohort of builds with the item and load in the browser.
 */
export function ItemHeroBreakdown({
  itemId,
  itemName,
  itemRequest,
  bestHeroes,
  onRetry,
}: {
  itemId: number;
  itemName: string;
  itemRequest: AnalyticsApiItemStatsRequest;
  bestHeroes: ItemBestHero[] | undefined;
  onRetry?: () => void;
}) {
  return (
    <>
      {bestHeroes === undefined ? (
        <Section title={`Best Heroes for ${itemName}`}>
          <ErrorState title={`Could not load ${possessive(itemName)} best heroes`} onRetry={onRetry} />
        </Section>
      ) : (
        bestHeroes.length > 0 && (
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
              {bestHeroes.map(({ heroId, winRate, usage, matches }, index) => (
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
        )
      )}
      <ItemPairings itemId={itemId} itemName={itemName} itemRequest={itemRequest} />
    </>
  );
}

function ItemPairings({
  itemId,
  itemName,
  itemRequest,
}: {
  itemId: number;
  itemName: string;
  itemRequest: AnalyticsApiItemStatsRequest;
}) {
  const cohortQuery = useQuery(itemStatsQueryOptions({ ...itemRequest, bucket: "hero", includeItemIds: [itemId] }));
  const itemsQuery = useQuery(itemUpgradesQueryOptions);

  const paired = useMemo(() => {
    const items = itemsQuery.data;
    const item = items?.find((candidate) => candidate.id === itemId);
    if (!cohortQuery.data || !items || !item) return null;
    return pickPairedItems(cohortQuery.data, item, filterShopableItems(items));
  }, [cohortQuery.data, itemsQuery.data, itemId]);

  // Checked before loading: without the item list the pairings never resolve, so a failed one would spin forever.
  const failed = [cohortQuery, itemsQuery].filter((query) => query.isError && !query.data);
  if (failed.length > 0) {
    return (
      <Section title={`Often Built with ${itemName}`}>
        <ErrorState
          title={`Could not load ${possessive(itemName)} pairings`}
          retrying={failed.some((query) => query.isFetching)}
          onRetry={() => failed.forEach((query) => void query.refetch())}
        />
      </Section>
    );
  }
  if (!paired) return <LoadingState label={`${itemName} pairings`} />;
  if (paired.length === 0) return null;

  return (
    <Section
      title={`Often Built with ${itemName}`}
      description={
        <>
          The items that most often share a build with {itemName}. "Together" is how many {itemName} buyers also bought
          the item, and the win rate counts only builds with both.
        </>
      }
    >
      <RankedEntityGrid>
        {paired.map(({ item, winRate, pairRate }, index) => (
          <RankedEntityCard key={item.id} rank={index + 1} entity={{ itemId: item.id }}>
            <KeyValue label="Win" value={formatPercent(winRate)} />
            <KeyValue label="Together" value={formatShare(pairRate)} />
          </RankedEntityCard>
        ))}
      </RankedEntityGrid>
    </Section>
  );
}
