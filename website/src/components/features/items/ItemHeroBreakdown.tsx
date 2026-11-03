import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { RankedEntityList, RankedEntityMetric, RankedEntityRow } from "~/components/domain/assets/RankedEntityList";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { buildComponentImplications } from "~/lib/build-transform";
import { formatPercent, formatShare, formatSignedPoints, possessive } from "~/lib/format";
import type { ItemBestHero, ItemCohortRow } from "~/lib/item-hero-fns";
import { toneOf } from "~/lib/tone";
import { winRateNoise } from "~/lib/wilson";
import { filterShopableItems, itemUpgradesQueryOptions, type SlimUpgrade } from "~/queries/asset-queries";

const TOP_COUNT = 8;

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
function pickPairedItems(
  rows: readonly ItemCohortRow[],
  item: SlimUpgrade,
  items: readonly SlimUpgrade[],
): PairedItem[] {
  const totals = new Map(rows.map((row) => [row.item_id, row]));
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
  // The bars reach the edge at the list's largest change, never below a point, so a flat list stays short.
  const changeScale = Math.max(0.01, ...(bestHeroes ?? []).map((hero) => Math.abs(hero.winRateChange)));
  return (
    <Panel className={className}>
      <PanelHeader
        title={`Best Heroes for ${itemName}`}
        description="vs. what the hero's and the item's usual win rates predict"
      />
      <PanelBody className="flex-1">
        {bestHeroes === undefined ? (
          <ErrorState variant="inline" title={`Could not load ${possessive(itemName)} best heroes`} onRetry={onRetry} />
        ) : bestHeroes.length === 0 ? (
          <EmptyState variant="inline" title={`No hero buys ${itemName} often enough to rank yet`} />
        ) : (
          <RankedEntityList>
            {bestHeroes.map(({ heroId, winRate, expectedWinRate, winRateChange, usage, matches }, index) => (
              <RankedEntityRow
                key={heroId}
                rank={index + 1}
                entity={{ heroId }}
                meta={
                  // Rounded where the list is narrow, so the count stays whole under the name.
                  <>
                    <span className="@md:hidden">
                      {matches.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 0 })} matches
                    </span>
                    <span className="hidden @md:inline">{matches.toLocaleString("en-US")} matches</span>
                  </>
                }
              >
                <RankedEntityMetric
                  label="Vs. expected"
                  labelDisplay={index === 0 ? "visible" : "hidden"}
                  width="wide"
                  value={formatSignedPoints(winRateChange)}
                  tone={toneOf(Math.round(winRateChange * 1000))}
                  // Only a difference outside the sample's noise takes a color.
                  significant={Math.abs(winRateChange) >= winRateNoise(matches)}
                  change={{ value: winRateChange, scale: changeScale }}
                  details={
                    <TooltipStats variant="plain">
                      <TooltipStat label="Win rate after buying it" value={formatPercent(winRate)} />
                      <TooltipStat label="Expected from hero and item" value={formatPercent(expectedWinRate)} />
                      <TooltipStat label="Change, toward expected" value={formatSignedPoints(winRateChange, 2)} />
                    </TooltipStats>
                  }
                />
                <RankedEntityMetric
                  label="Win rate"
                  labelDisplay={index === 0 ? "visible" : "hidden"}
                  priority="secondary"
                  value={formatPercent(winRate)}
                  tone={toneOf(winRate, 0.5)}
                />
                <RankedEntityMetric
                  label="Bought"
                  labelDisplay={index === 0 ? "visible" : "hidden"}
                  priority="secondary"
                  value={formatShare(usage)}
                  share={usage}
                />
              </RankedEntityRow>
            ))}
          </RankedEntityList>
        )}
      </PanelBody>
    </Panel>
  );
}

/**
 * `cohort` comes from the page loader (`fetchItemCohort`), so the pairings are in the server HTML; undefined when it
 * failed.
 */
export function ItemPairings({
  itemId,
  itemName,
  cohort,
  onRetry,
  className,
}: {
  itemId: number;
  itemName: string;
  cohort: ItemCohortRow[] | undefined;
  onRetry?: () => void;
  className?: string;
}) {
  const itemsQuery = useQuery(itemUpgradesQueryOptions);

  const paired = useMemo(() => {
    const items = itemsQuery.data;
    const item = items?.find((candidate) => candidate.id === itemId);
    if (!cohort || !items || !item) return null;
    return pickPairedItems(cohort, item, filterShopableItems(items));
  }, [cohort, itemsQuery.data, itemId]);

  // Checked before loading: without the item list the pairings never resolve, so a failed one would spin forever.
  const itemsFailed = itemsQuery.isError && !itemsQuery.data;

  return (
    <Panel className={className}>
      <PanelHeader title={`Often Built with ${itemName}`} description="in the same build" />
      <PanelBody className="flex-1">
        {cohort === undefined || itemsFailed ? (
          <ErrorState
            variant="inline"
            title={`Could not load ${possessive(itemName)} pairings`}
            retrying={itemsFailed && itemsQuery.isFetching}
            onRetry={() => (itemsFailed ? void itemsQuery.refetch() : onRetry?.())}
          />
        ) : !paired ? (
          <LoadingState label={`${itemName} pairings`} variant="skeleton" />
        ) : paired.length === 0 ? (
          <EmptyState variant="inline" title={`No item shares enough builds with ${itemName} yet`} />
        ) : (
          <RankedEntityList>
            {paired.map(({ item, winRate, pairRate }, index) => (
              <RankedEntityRow key={item.id} rank={index + 1} entity={{ itemId: item.id }}>
                <RankedEntityMetric
                  label="Win rate"
                  labelDisplay={index === 0 ? "visible" : "hidden"}
                  value={formatPercent(winRate)}
                  tone={toneOf(winRate, 0.5)}
                />
                <RankedEntityMetric
                  label="Together"
                  labelDisplay={index === 0 ? "visible" : "hidden"}
                  value={formatShare(pairRate)}
                  share={pairRate}
                />
              </RankedEntityRow>
            ))}
          </RankedEntityList>
        )}
      </PanelBody>
    </Panel>
  );
}
