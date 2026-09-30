import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiItemStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import { RankedEntityList, RankedEntityMetric, RankedEntityRow } from "~/components/domain/assets/RankedEntityList";
import { Panel, PanelBody, PanelFooter, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { buildComponentImplications } from "~/lib/build-transform";
import { formatPercent, formatShare, possessive } from "~/lib/format";
import type { ItemBestHero } from "~/lib/item-hero-fns";
import { toneOf } from "~/lib/tone";
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
      // Purchases, not builds: an item sold and bought back counts twice, so the share is capped at all of them.
      return [{ item: other, winRate: acc.wins / acc.matches, pairRate: Math.min(1, acc.matches / own.matches) }];
    })
    .sort((a, b) => b.pairRate - a.pairRate)
    .slice(0, TOP_COUNT);
}

/**
 * `bestHeroes` comes from the page loader (`fetchItemBestHeroes`), so it is in the server HTML; undefined when it failed.
 */
export function ItemBestHeroes({
  itemName,
  bestHeroes,
  onRetry,
  className,
}: {
  itemName: string;
  bestHeroes: ItemBestHero[] | undefined;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <Panel className={className}>
      <PanelHeader title={`Best Heroes for ${itemName}`} description="by win rate after buying it" />
      <PanelBody className="flex-1">
        {bestHeroes === undefined ? (
          <ErrorState variant="inline" title={`Could not load ${possessive(itemName)} best heroes`} onRetry={onRetry} />
        ) : bestHeroes.length === 0 ? (
          <EmptyState variant="inline" title={`No hero buys ${itemName} often enough to rank yet`} />
        ) : (
          <RankedEntityList>
            {bestHeroes.map(({ heroId, winRate, usage, matches }, index) => (
              <RankedEntityRow
                key={heroId}
                rank={index + 1}
                entity={{ heroId }}
                meta={`${matches.toLocaleString("en-US")} matches`}
              >
                <RankedEntityMetric label="Win rate" value={formatPercent(winRate)} tone={toneOf(winRate, 0.5)} />
                <RankedEntityMetric label="Bought" value={formatShare(usage)} share={usage} />
              </RankedEntityRow>
            ))}
          </RankedEntityList>
        )}
      </PanelBody>
      <PanelFooter>
        Ranked by the low end of each win rate&apos;s confidence interval. &quot;Bought&quot; is the share of the
        hero&apos;s matches with {itemName}.
      </PanelFooter>
    </Panel>
  );
}

/** The pairings need the whole cohort of builds with the item and load in the browser. */
export function ItemPairings({
  itemId,
  itemName,
  itemRequest,
  className,
}: {
  itemId: number;
  itemName: string;
  itemRequest: AnalyticsApiItemStatsRequest;
  className?: string;
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

  return (
    <Panel className={className}>
      <PanelHeader title={`Often Built with ${itemName}`} description="in the same build" />
      <PanelBody className="flex-1">
        {failed.length > 0 ? (
          <ErrorState
            variant="inline"
            title={`Could not load ${possessive(itemName)} pairings`}
            retrying={failed.some((query) => query.isFetching)}
            onRetry={() => failed.forEach((query) => void query.refetch())}
          />
        ) : !paired ? (
          <LoadingState label={`${itemName} pairings`} variant="skeleton" />
        ) : paired.length === 0 ? (
          <EmptyState variant="inline" title={`No item shares enough builds with ${itemName} yet`} />
        ) : (
          <RankedEntityList>
            {paired.map(({ item, winRate, pairRate }, index) => (
              <RankedEntityRow key={item.id} rank={index + 1} entity={{ itemId: item.id }}>
                <RankedEntityMetric label="Win rate" value={formatPercent(winRate)} tone={toneOf(winRate, 0.5)} />
                <RankedEntityMetric label="Together" value={formatShare(pairRate)} share={pairRate} />
              </RankedEntityRow>
            ))}
          </RankedEntityList>
        )}
      </PanelBody>
      <PanelFooter>
        &quot;Together&quot; is the share of {itemName} buyers who also bought the item; the win rate counts only builds
        with both. Its own components and upgrades are left out.
      </PanelFooter>
    </Panel>
  );
}
