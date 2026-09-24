import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { AnalyticsApiItemStatsRequest, Upgrade } from "deadlock_api_client";
import { useMemo } from "react";

import { RankedEntityCard, RankedEntityGrid } from "~/components/domain/assets/RankedEntityGrid";
import { Section } from "~/components/patterns/page/Section";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Button } from "~/components/ui/button";
import { KeyValue } from "~/components/ui/key-value";
import { formatPercent, formatShare } from "~/lib/format";
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
  rankRange,
}: {
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
  if (failed.length > 0) {
    return (
      <Section title={`Best ${heroName} Items`}>
        <ErrorState
          title={`Could not load the best ${heroName} items`}
          retrying={failed.some((query) => query.isFetching)}
          onRetry={() => failed.forEach((query) => void query.refetch())}
        />
      </Section>
    );
  }
  if (!topItems) return <LoadingState label="top items" />;
  if (topItems.length === 0) return null;

  return (
    <Section
      title={`Best ${heroName} Items`}
      description={`The items that most reliably win on ${heroName} in ${rankRange} matches, ranked by the lower bound of their win rate's confidence interval so a handful of lucky matches can't carry an item to the top.`}
    >
      <RankedEntityGrid>
        {topItems.map(({ item, winRate, usage, matches }, index) => (
          <RankedEntityCard
            key={item.id}
            rank={index + 1}
            entity={{ itemId: item.id }}
            title={`${item.name}: ${matches.toLocaleString("en-US")} matches`}
          >
            <KeyValue label="Win" value={formatPercent(winRate)} />
            <KeyValue label="Bought" value={formatShare(usage)} />
          </RankedEntityCard>
        ))}
      </RankedEntityGrid>
      <Button asChild variant="link" size="inline" className="self-start">
        <Link
          to="/analytics/items"
          search={{ hero: heroId, min_rank: request.minAverageBadge, max_rank: request.maxAverageBadge }}
          preload="intent"
        >
          All {heroName} item stats
        </Link>
      </Button>
    </Section>
  );
}
