import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { AnalyticsApiItemStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import { RankedEntityList, RankedEntityMetric, RankedEntityRow } from "~/components/domain/assets/RankedEntityList";
import { Panel, PanelBody, PanelFooter, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { TextLink } from "~/components/ui/text-link";
import { formatPercent, formatShare } from "~/lib/format";
import { toneOf } from "~/lib/tone";
import { wilsonScoreInterval } from "~/lib/wilson";
import { itemUpgradesQueryOptions, type SlimUpgrade } from "~/queries/asset-queries";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";

const TOP_ITEM_COUNT = 8;
/** Items bought in fewer of the hero's matches than this are too rare for the ranking to mean much. */
const MIN_USAGE = 0.05;

interface TopItem {
  item: SlimUpgrade;
  winRate: number;
  usage: number;
  matches: number;
}

/** Ranks by the Wilson lower bound so a few lucky matches can't put a rarely bought item on top. */
function pickTopItems(
  stats: readonly { item_id: number; wins: number; matches: number }[],
  items: readonly SlimUpgrade[],
  heroMatches: number,
): TopItem[] {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  return stats
    .flatMap((row) => {
      const item = itemsById.get(row.item_id);
      if (!item || row.matches < heroMatches * MIN_USAGE) return [];
      const [lowerBound] = wilsonScoreInterval(row.wins, row.matches);
      return [
        {
          item,
          winRate: row.wins / row.matches,
          // Purchases, not matches: an item sold and bought back counts twice, so the share is capped at all of them.
          usage: Math.min(1, row.matches / heroMatches),
          matches: row.matches,
          lowerBound,
        },
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
  rankRange,
  className,
}: {
  className?: string;
  heroId: number;
  heroName: string;
  heroMatches: number;
  request: Omit<AnalyticsApiItemStatsRequest, "heroId">;
  /** The request's rank range in words, such as "Phantom 1+". */
  rankRange: string;
}) {
  const statsQuery = useQuery(itemStatsQueryOptions({ ...request, heroId }));
  const itemsQuery = useQuery(itemUpgradesQueryOptions);

  const topItems = useMemo(
    () => (statsQuery.data && itemsQuery.data ? pickTopItems(statsQuery.data, itemsQuery.data, heroMatches) : null),
    [statsQuery.data, itemsQuery.data, heroMatches],
  );

  // Checked before loading: without the item list the ranking never resolves, so a failed one would spin forever.
  const failed = [statsQuery, itemsQuery].filter((query) => query.isError && !query.data);

  return (
    <Panel className={className}>
      <PanelHeader title={`Best ${heroName} Items`} description={`${rankRange} · by win rate`} />
      <PanelBody>
        {failed.length > 0 ? (
          <ErrorState
            variant="inline"
            title={`Could not load the best ${heroName} items`}
            retrying={failed.some((query) => query.isFetching)}
            onRetry={() => failed.forEach((query) => void query.refetch())}
          />
        ) : !topItems ? (
          <LoadingState label="top items" variant="skeleton" />
        ) : topItems.length === 0 ? (
          <EmptyState variant="inline" title={`No item is bought often enough on ${heroName} to rank yet`} />
        ) : (
          <RankedEntityList>
            {topItems.map(({ item, winRate, usage, matches }, index) => (
              <RankedEntityRow
                key={item.id}
                rank={index + 1}
                entity={{ itemId: item.id }}
                meta={`${matches.toLocaleString("en-US")} matches`}
              >
                <RankedEntityMetric label="Win rate" value={formatPercent(winRate)} tone={toneOf(winRate, 0.5)} />
                <RankedEntityMetric label="Bought" value={formatShare(usage)} share={usage} />
              </RankedEntityRow>
            ))}
          </RankedEntityList>
        )}
      </PanelBody>
      <PanelFooter className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span>
          Ranked by the low end of each win rate&apos;s confidence interval, so a few lucky games can&apos;t top it.
        </span>
        <TextLink asChild>
          <Link
            to="/analytics/items"
            search={{ hero: heroId, min_rank: request.minAverageBadge, max_rank: request.maxAverageBadge }}
            preload="intent"
          >
            All {heroName} item stats
          </Link>
        </TextLink>
      </PanelFooter>
    </Panel>
  );
}
