import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiItemStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import { PATCH_MARKERS_SHORT } from "~/components/domain/charts/PatchMarkers";
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
  // With both kinds of purchase counted, the corrupted purchases are charted beside the normal ones. The other stats
  // chart both kinds together, as their table cells count them.
  const splitCorrupted = params.corruptedItems === "include" && (stat === "winRate" || stat === "pickRate");
  // The differences to the tier are measured within each day against that day's shop items, as the table measures
  // them against the shop items on screen.
  const byTier = stat === "vsTier" || stat === "pickVsTier";
  const { data: assetsItems } = useQuery({ ...itemUpgradesQueryOptions, enabled: byTier });
  const corruptedParams = { ...itemParams, corruptedItems: "only" as const };
  const itemQuery = useQuery(itemStatsQueryOptions(itemParams));
  const corruptedQuery = useQuery({ ...itemStatsQueryOptions(corruptedParams), enabled: splitCorrupted });
  const itemData = itemQuery.data;
  const corruptedData = corruptedQuery.data;
  const chartData = useMemo(() => {
    const range = { minUnixTimestamp: params.minUnixTimestamp, maxUnixTimestamp: params.maxUnixTimestamp };
    const rows = completeTimeBuckets(itemData ?? [], BUCKET, range);
    // The table's pick rate is relative to the most bought item; each bucket is measured against its own.
    const mostBought = new Map<number, number>();
    for (const row of rows) mostBought.set(row.bucket, Math.max(mostBought.get(row.bucket) ?? 0, row.matches));
    const corruptedByBucket = new Map(
      splitCorrupted
        ? (corruptedData ?? []).filter((row) => row.item_id === itemId).map((row) => [row.bucket, row])
        : [],
    );
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
    return itemRows.map((row): StatTrendPoint => {
      if (!splitCorrupted) {
        return { date: row.bucket * 1000, value: rate(row.wins, row.matches, row.bucket), matches: row.matches };
      }
      // The combined counts include the corrupted purchases: take them out for the normal series.
      const corrupted = corruptedByBucket.get(row.bucket);
      const corruptedMatches = Math.min(corrupted?.matches ?? 0, row.matches);
      const corruptedWins = Math.min(corrupted?.wins ?? 0, row.wins);
      const normalMatches = row.matches - corruptedMatches;
      return {
        date: row.bucket * 1000,
        value: normalMatches > 0 ? rate(row.wins - corruptedWins, normalMatches, row.bucket) : null,
        matches: normalMatches,
        comparison: corruptedMatches > 0 ? rate(corruptedWins, corruptedMatches, row.bucket) : null,
        comparisonMatches: corruptedMatches,
      };
    });
  }, [
    itemData,
    corruptedData,
    assetsItems,
    splitCorrupted,
    byTier,
    itemId,
    stat,
    params.minUnixTimestamp,
    params.maxUnixTimestamp,
  ]);

  const pending = itemQuery.isPending || (splitCorrupted && corruptedQuery.isPending) || (byTier && !assetsItems);
  const failed = itemQuery.isError || (splitCorrupted && corruptedQuery.isError);
  return (
    <StatTrendChart
      data={chartData}
      markers={PATCH_MARKERS_SHORT}
      state={pending ? "loading" : failed ? "error" : "ready"}
      stat={ITEM_TABLE_TRENDS[stat]}
      value={BUCKET}
      comparisonLabel={splitCorrupted ? "Corrupted" : undefined}
      valueLabel={splitCorrupted ? "Normal" : undefined}
    />
  );
}
