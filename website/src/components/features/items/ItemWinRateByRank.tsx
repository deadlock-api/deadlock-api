import { useQueries, useQuery } from "@tanstack/react-query";
import type { AnalyticsApiItemStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import {
  rankTierLook,
  type RankTierWinRate,
  RankTierWinRateChart,
} from "~/components/domain/rank/RankTierWinRateChart";
import { useDefaultPeriodLabel } from "~/hooks/useDefaultPeriodLabel";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";
import { ranksQueryOptions } from "~/queries/ranks-query";

// Tier extremes drive the summary, so a thin tier at ±4pp noise (n≈170) would often be named best or worst.
const MIN_TIER_MATCHES = 500;
/** Initiate through Eternus; Obscurus (tier 0) is the unranked badge. */
const TIERS = Array.from({ length: 11 }, (_, i) => i + 1);

/**
 * The item stats endpoint has no rank bucket, so each tier is its own request. Every item page sends the same eleven,
 * so they are shared across items.
 */
export function ItemWinRateByRank({
  itemId,
  itemName,
  request,
  className,
}: {
  className?: string;
  itemId: number;
  itemName: string;
  request: AnalyticsApiItemStatsRequest;
}) {
  const period = useDefaultPeriodLabel();
  const { data: ranks } = useQuery(ranksQueryOptions);
  const { rows, isPending, failed } = useQueries({
    queries: TIERS.map((tier) =>
      itemStatsQueryOptions({ ...request, minAverageBadge: tier * 10, maxAverageBadge: tier * 10 + 9 }),
    ),
    combine: (queries) => ({
      rows: queries.map((q) => q.data?.find((row) => row.item_id === itemId)),
      isPending: queries.some((q) => q.isPending),
      // A missing tier could hide the true best or worst, so any failure fails the section.
      failed: queries.filter((q) => q.isError && !q.data),
    }),
  });

  const tiers = useMemo(
    () =>
      TIERS.flatMap((tier, i): RankTierWinRate[] => {
        const row = rows[i];
        if (!row || row.matches < MIN_TIER_MATCHES) return [];
        return [
          {
            ...rankTierLook(
              tier,
              ranks?.find((r) => r.tier === tier),
            ),
            winRate: row.wins / row.matches,
            matches: row.matches,
          },
        ];
      }),
    [rows, ranks],
  );

  return (
    <RankTierWinRateChart
      className={className}
      description={`All ranks · ${period}`}
      tiers={tiers}
      subject="Buyers win"
      label={`${itemName} win rate by rank tier`}
      status={failed.length > 0 ? "error" : isPending ? "pending" : "success"}
      retrying={failed.some((q) => q.isFetching)}
      onRetry={() => failed.forEach((q) => void q.refetch())}
      minTiers={2}
      emptyLabel="rank tiers with enough purchases"
    />
  );
}
