import { useQueries, useQuery } from "@tanstack/react-query";
import type { AnalyticsApiItemStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import { RankTierTick } from "~/components/domain/rank/RankTierTick";
import { ChartCard } from "~/components/patterns/charts/ChartCard";
import { ChartEmpty, ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { CHART_COLOR } from "~/components/patterns/charts/theme";
import { WinRateBarChart } from "~/components/patterns/charts/WinRateBarChart";
import { PanelBody } from "~/components/patterns/panel/Panel";
import { TooltipCard, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { CACHE_DURATIONS } from "~/constants/cache";
import { useDefaultPeriodLabel } from "~/hooks/useDefaultPeriodLabel";
import { api } from "~/lib/api";
import { formatPercent } from "~/lib/format";
import { queryKeys } from "~/queries/query-keys";
import { ranksQueryOptions } from "~/queries/ranks-query";

// Tier extremes drive the summary, so a thin tier at ±4pp noise (n≈170) would often be named best or worst.
const MIN_TIER_MATCHES = 500;
/** Initiate through Eternus; Obscurus (tier 0) is the unranked badge. */
const TIERS = Array.from({ length: 11 }, (_, i) => i + 1);

interface TierEntry {
  tier: number;
  name: string;
  color: string;
  image?: string;
  winRate: number;
  matches: number;
}

function TierTooltip({ entry }: { entry?: TierEntry }) {
  if (!entry) return null;
  return (
    <TooltipCard>
      <TooltipHeader leading={entry.image && <img src={entry.image} alt="" className="size-6" />} title={entry.name} />
      <TooltipStats>
        <TooltipStat label="Win rate" value={formatPercent(entry.winRate)} />
        <TooltipStat label="Matches" value={entry.matches.toLocaleString("en-US")} />
      </TooltipStats>
    </TooltipCard>
  );
}

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
    queries: TIERS.map((tier) => {
      const params = { ...request, minAverageBadge: tier * 10, maxAverageBadge: tier * 10 + 9 };
      return {
        queryKey: queryKeys.analytics.itemStats(params),
        queryFn: async () => (await api.analytics_api.itemStats(params)).data,
        staleTime: CACHE_DURATIONS.ONE_DAY,
      };
    }),
    combine: (queries) => ({
      rows: queries.map((q) => q.data?.find((row) => row.item_id === itemId)),
      isPending: queries.some((q) => q.isPending),
      // A missing tier could hide the true best or worst, so any failure fails the section.
      failed: queries.filter((q) => q.isError && !q.data),
    }),
  });

  const tiers = useMemo(
    () =>
      TIERS.flatMap((tier, i): TierEntry[] => {
        const row = rows[i];
        if (!row || row.matches < MIN_TIER_MATCHES) return [];
        const rank = ranks?.find((r) => r.tier === tier);
        return [
          {
            tier,
            name: rank?.name ?? `Tier ${tier}`,
            color: rank?.color ?? CHART_COLOR.primary,
            image: rank?.images.large_webp ?? rank?.images.large ?? undefined,
            winRate: row.wins / row.matches,
            matches: row.matches,
          },
        ];
      }),
    [rows, ranks],
  );

  const best = tiers.length > 0 ? tiers.reduce((a, b) => (b.winRate > a.winRate ? b : a)) : undefined;
  const worst = tiers.length > 0 ? tiers.reduce((a, b) => (b.winRate < a.winRate ? b : a)) : undefined;
  const chartLabel = `${itemName} win rate by rank tier`;

  return (
    <ChartCard
      className={className}
      title="Win Rate by Rank"
      description={`All ranks · ${period}`}
      footer={
        best &&
        worst &&
        tiers.length >= 2 && (
          <>
            Buyers win most at {best.name} ({formatPercent(best.winRate)}) and least at {worst.name} (
            {formatPercent(worst.winRate)}). Hover a bar for matches.
          </>
        )
      }
    >
      <PanelBody size="sm">
        {failed.length > 0 ? (
          <ChartError
            label="win rate by rank"
            retrying={failed.some((q) => q.isFetching)}
            onRetry={() => failed.forEach((q) => void q.refetch())}
          />
        ) : isPending ? (
          <ChartLoading label={chartLabel} />
        ) : tiers.length < 2 ? (
          <ChartEmpty label="rank tiers with enough purchases" />
        ) : (
          <WinRateBarChart
            variant="flush"
            label={chartLabel}
            data={tiers}
            xKey="tier"
            valueKey="winRate"
            colorKey="color"
            xAxisHeight={48}
            xTick={<RankTierTick tiers={tiers} />}
            tooltip={<TierTooltip />}
          />
        )}
      </PanelBody>
    </ChartCard>
  );
}
