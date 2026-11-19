import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiItemStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import { ItemCell } from "~/components/domain/assets/ItemCell";
import { RankedEntityList, RankedEntityMetric, RankedEntityRow } from "~/components/domain/assets/RankedEntityList";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { formatPercent, formatShare } from "~/lib/format";
import { toneOf } from "~/lib/tone";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";

/** Imbue items put into an ability in fewer of the hero's matches than this are too rare to show. */
const MIN_IMBUE_SHARE = 0.02;

interface ImbueTarget {
  abilityId: number;
  matches: number;
  /** This ability's part of the item's imbues on the hero. */
  share: number;
  winRate: number;
}

interface ImbueItem {
  itemId: number;
  /** Purchases of the item imbued into one of the hero's abilities. */
  imbues: number;
  targets: ImbueTarget[];
}

/**
 * The `bucket=imbued_ability` rows (one per item and ability, only imbued purchases) grouped by item: the most imbued
 * item first, its most chosen ability first.
 */
function groupByItem(
  rows: readonly { item_id: number; bucket: number; wins: number; matches: number }[],
  heroMatches: number,
): ImbueItem[] {
  const byItem = new Map<number, { abilityId: number; wins: number; matches: number }[]>();
  for (const row of rows) {
    if (row.bucket === 0 || row.matches === 0) continue;
    const targets = byItem.get(row.item_id) ?? [];
    targets.push({ abilityId: row.bucket, wins: row.wins, matches: row.matches });
    byItem.set(row.item_id, targets);
  }
  return Array.from(byItem, ([itemId, targets]) => {
    const imbues = targets.reduce((sum, target) => sum + target.matches, 0);
    return {
      itemId,
      imbues,
      targets: targets
        .map(({ abilityId, wins, matches }) => ({
          abilityId,
          matches,
          share: matches / imbues,
          winRate: wins / matches,
        }))
        .sort((a, b) => b.matches - a.matches),
    };
  })
    .filter((item) => item.imbues >= heroMatches * MIN_IMBUE_SHARE)
    .sort((a, b) => b.imbues - a.imbues);
}

/** For each imbue item the hero buys, which of the hero's abilities it goes into, how often, and how those games end. */
export function HeroImbueTargets({
  heroId,
  heroName,
  heroMatches,
  request,
  rankRange,
  className,
}: {
  className?: string;
  heroId: number;
  heroName: string;
  heroMatches: number;
  request: Omit<AnalyticsApiItemStatsRequest, "heroId" | "bucket">;
  /** The request's rank range in words, such as "Phantom 1+". */
  rankRange: string;
}) {
  const statsQuery = useQuery(itemStatsQueryOptions({ ...request, heroId, bucket: "imbued_ability" }));
  const items = useMemo(
    () => (statsQuery.data ? groupByItem(statsQuery.data, heroMatches) : null),
    [statsQuery.data, heroMatches],
  );

  return (
    <Panel className={className}>
      <PanelHeader
        title={`${heroName} Imbue Targets`}
        description={`${rankRange} · the ability each imbue item goes into`}
      />
      <PanelBody>
        {statsQuery.isError && !statsQuery.data ? (
          <ErrorState
            variant="inline"
            title={`Could not load the ${heroName} imbue targets`}
            retrying={statsQuery.isFetching}
            onRetry={() => void statsQuery.refetch()}
          />
        ) : !items ? (
          <LoadingState label="imbue targets" variant="skeleton" />
        ) : items.length === 0 ? (
          <EmptyState variant="inline" title={`No imbue item is bought often enough on ${heroName} yet`} />
        ) : (
          <div className="@container">
            <ul className="grid gap-x-6 gap-y-4 @3xl:grid-cols-2 @6xl:grid-cols-3">
              {items.map(({ itemId, imbues, targets }) => (
                <li key={itemId} className="flex min-w-0 flex-col gap-1">
                  <ItemCell itemId={itemId} linkToDetail meta={`${imbues.toLocaleString("en-US")} imbues`} />
                  <RankedEntityList density="compact" columns="single">
                    {targets.map(({ abilityId, matches, share, winRate }, index) => (
                      <RankedEntityRow
                        key={abilityId}
                        rank={index + 1}
                        entity={{ abilityId }}
                        meta={`${matches.toLocaleString("en-US")} matches`}
                      >
                        <RankedEntityMetric label="Share" value={formatShare(share)} share={share} />
                        <RankedEntityMetric
                          label="Win rate"
                          value={formatPercent(winRate)}
                          tone={toneOf(winRate, 0.5)}
                        />
                      </RankedEntityRow>
                    ))}
                  </RankedEntityList>
                </li>
              ))}
            </ul>
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
