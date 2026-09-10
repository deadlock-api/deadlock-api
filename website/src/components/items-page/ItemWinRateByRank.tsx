import { useQueries, useQuery } from "@tanstack/react-query";
import type { AnalyticsApiItemStatsRequest } from "deadlock_api_client";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { LoadingLogo } from "~/components/LoadingLogo";
import { RankTierTick, rankTickSize } from "~/components/RankTierTick";
import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { percentTicks, winRateDomain } from "~/lib/chart-axis";
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

/**
 * The item stats endpoint has no rank bucket, so each tier is its own request. Every item page sends the same eleven,
 * so they are shared across items.
 */
export function ItemWinRateByRank({
  itemId,
  itemName,
  request,
}: {
  itemId: number;
  itemName: string;
  request: AnalyticsApiItemStatsRequest;
}) {
  const { data: ranks } = useQuery(ranksQueryOptions);
  const { rows, isPending } = useQueries({
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
    }),
  });
  const [chartWidth, setChartWidth] = useState(0);

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
            color: rank?.color ?? "var(--color-primary)",
            image: rank?.images.large_webp ?? rank?.images.large ?? undefined,
            winRate: row.wins / row.matches,
            matches: row.matches,
          },
        ];
      }),
    [rows, ranks],
  );

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingLogo />
      </div>
    );
  }
  if (tiers.length < 2) return null;

  const best = tiers.reduce((a, b) => (b.winRate > a.winRate ? b : a));
  const worst = tiers.reduce((a, b) => (b.winRate < a.winRate ? b : a));
  const winRateAxis = winRateDomain([0.5, ...tiers.map((tier) => tier.winRate)]);

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">{itemName} Win Rate by Rank</h2>
      <p className="text-sm text-muted-foreground">
        Buyers win most at <span className="font-semibold text-foreground">{best.name}</span> (
        {formatPercent(best.winRate)}) and least at <span className="font-semibold text-foreground">{worst.name}</span>{" "}
        ({formatPercent(worst.winRate)}). Each bar is one rank tier in the current patch; hover for match count.
      </p>
      <figure aria-label={`${itemName} win rate by rank tier`}>
        <ResponsiveContainer
          width="100%"
          height={280}
          className="rounded-xl bg-muted p-2"
          onResize={(width) => setChartWidth(width)}
        >
          <BarChart data={tiers} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
            <XAxis
              dataKey="tier"
              interval={0}
              height={48}
              tickLine={false}
              axisLine={false}
              tick={<RankTierTick tiers={tiers} size={rankTickSize(chartWidth, tiers.length)} />}
            />
            <YAxis
              domain={winRateAxis}
              ticks={percentTicks(winRateAxis)}
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              width={44}
              stroke="#525252"
              tick={{ fontSize: 11 }}
            />
            <ReferenceLine y={0.5} stroke="#525252" strokeDasharray="4 4" />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const entry = payload[0].payload as TierEntry;
                return (
                  <div className="flex items-center gap-2 rounded-md bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md">
                    {entry.image && <img src={entry.image} alt="" className="size-6" />}
                    <div>
                      <div className="font-medium">{entry.name}</div>
                      <div className="text-muted-foreground">
                        Win rate {formatPercent(entry.winRate)} · {entry.matches.toLocaleString("en-US")} matches
                      </div>
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey={(entry: TierEntry) => [0.5, entry.winRate]} radius={4}>
              {tiers.map((entry) => (
                <Cell key={entry.tier} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </figure>
    </section>
  );
}
