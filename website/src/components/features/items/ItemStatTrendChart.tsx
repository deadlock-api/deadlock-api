import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiItemStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import { usePatchMarkers } from "~/components/domain/charts/PatchMarkers";
import StatTrendChart, { type StatTrendBucket } from "~/components/patterns/charts/StatTrendChart";
import { MIN_MATCHES_PER_BUCKET } from "~/lib/constants";
import {
  ITEM_TABLE_TRENDS,
  itemKeptRate,
  itemTierTotals,
  type ItemTableTrend,
  itemVsTier,
} from "~/lib/item-table-trends";
import type { StatTrendPoint } from "~/lib/stat-format";
import { completeTimeBuckets } from "~/lib/time-buckets";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { shopableItemIds } from "~/queries/item-permutation-query";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";

export interface ItemStatTrendChartProps {
  params: AnalyticsApiItemStatsRequest;
  itemId: number;
  stat: ItemTableTrend;
}

// The trend lives in a hover card, so it is read-only (a hover card's content is out of the tab order): one interval.
const BUCKET: StatTrendBucket = "start_time_day";

export default function ItemStatTrendChart({ params, itemId, stat }: ItemStatTrendChartProps) {
  // `minMatches` would apply to every bucket on its own and drop the quiet ones; the sample floor below handles them.
  const itemParams = { ...params, minMatches: undefined, bucket: BUCKET };
  // The differences to the tier are measured within each day against that day's shop items, as the table measures
  // them against the shop items on screen.
  const byTier = stat === "vsTier" || stat === "pickVsTier";
  const { data: assetsItems } = useQuery({ ...itemUpgradesQueryOptions, enabled: byTier });
  const itemQuery = useQuery(itemStatsQueryOptions(itemParams));
  const itemData = itemQuery.data;
  const chartData = useMemo(() => {
    const range = { minUnixTimestamp: params.minUnixTimestamp, maxUnixTimestamp: params.maxUnixTimestamp };
    const rows = completeTimeBuckets(itemData ?? [], BUCKET, range);
    // The table's pick rate is relative to the most bought item; each bucket is measured against its own.
    const mostBought = new Map<number, number>();
    for (const row of rows) mostBought.set(row.bucket, Math.max(mostBought.get(row.bucket) ?? 0, row.matches));
    const rate = (wins: number, matches: number, bucketStart: number) =>
      stat === "winRate" ? wins / matches : matches / (mostBought.get(bucketStart) ?? matches);
    const itemRows = rows
      .filter((row) => row.item_id === itemId && row.matches >= MIN_MATCHES_PER_BUCKET)
      .sort((a, b) => a.bucket - b.bucket);
    if (stat === "buyTime" || stat === "kept") {
      return itemRows.map((row): StatTrendPoint => ({
        date: row.bucket * 1000,
        value: stat === "buyTime" ? row.avg_buy_time_s : itemKeptRate(row),
        matches: row.matches,
      }));
    }
    if (byTier) {
      if (!assetsItems) return [];
      const shopable = shopableItemIds(assetsItems);
      const tiers = new Map(assetsItems.map((item) => [item.id, item.item_tier || 0]));
      const tierOf = (row: { item_id: number }) => tiers.get(row.item_id) ?? 0;
      const shopRowsByBucket = new Map<number, typeof rows>();
      for (const row of rows) {
        if (!shopable.has(row.item_id)) continue;
        const bucketRows = shopRowsByBucket.get(row.bucket) ?? [];
        bucketRows.push(row);
        shopRowsByBucket.set(row.bucket, bucketRows);
      }
      return itemRows.map((row): StatTrendPoint => {
        const tierTotals = itemTierTotals(shopRowsByBucket.get(row.bucket) ?? [], tierOf);
        const measured = itemVsTier(row, tierTotals.get(tierOf(row)));
        return {
          date: row.bucket * 1000,
          value: stat === "vsTier" ? measured.vsTier : measured.pickVsTier,
          matches: row.matches,
        };
      });
    }
    return itemRows.map((row): StatTrendPoint => ({
      date: row.bucket * 1000,
      value: rate(row.wins, row.matches, row.bucket),
      matches: row.matches,
    }));
  }, [itemData, assetsItems, byTier, itemId, stat, params.minUnixTimestamp, params.maxUnixTimestamp]);

  const pending = itemQuery.isPending || (byTier && !assetsItems);
  const failed = itemQuery.isError;
  const patchMarkers = usePatchMarkers("sm");
  return (
    <StatTrendChart
      data={chartData}
      markers={patchMarkers}
      state={pending ? "loading" : failed ? "error" : "ready"}
      stat={ITEM_TABLE_TRENDS[stat]}
      value={BUCKET}
    />
  );
}
