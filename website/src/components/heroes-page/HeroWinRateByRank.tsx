import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiHeroStatsRequest, Rank } from "deadlock_api_client";
import { useMemo } from "react";
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
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { getPickrateMultiplier } from "~/lib/constants";
import { queryKeys } from "~/queries/query-keys";
import { ranksQueryOptions } from "~/queries/ranks-query";

const MIN_TIER_MATCHES = 100;

interface TierEntry {
  tier: number;
  name: string;
  color: string;
  image?: string;
  winRate: number;
  pickRate: number;
  matches: number;
}

function pct(x: number): string {
  return `${(100 * x).toFixed(1)}%`;
}

function RankTick({
  x,
  y,
  payload,
  tiers,
}: {
  x?: number;
  y?: number;
  payload?: { value: number };
  tiers: TierEntry[];
}) {
  const entry = tiers.find((t) => t.tier === payload?.value);
  if (x === undefined || y === undefined || !entry) return null;
  const size = 36;
  return entry.image ? (
    <image href={entry.image} x={x - size / 2} y={y + 4} width={size} height={size}>
      <title>{entry.name}</title>
    </image>
  ) : (
    <text x={x} y={y + 16} textAnchor="middle" fontSize={11} fill="currentColor">
      {entry.name}
    </text>
  );
}

export function HeroWinRateByRank({
  heroId,
  heroName,
  request,
}: {
  heroId: number;
  heroName: string;
  request: Omit<AnalyticsApiHeroStatsRequest, "gameMode"> & { gameMode?: GameMode };
}) {
  const byRankRequest = { ...request, bucket: "avg_badge" as const };
  const { data, isPending } = useQuery({
    queryKey: queryKeys.analytics.heroStatsByRank(byRankRequest),
    queryFn: async () => (await api.analytics_api.heroStats(byRankRequest)).data,
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
  const { data: ranks } = useQuery(ranksQueryOptions);

  const tiers = useMemo(() => {
    if (!data || !ranks) return [];
    const rankByTier = new Map<number, Rank>(ranks.map((r) => [r.tier, r]));
    const hero = new Map<number, { wins: number; matches: number }>();
    const all = new Map<number, number>();
    for (const row of data) {
      if (row.bucket <= 0) continue;
      const tier = Math.floor(row.bucket / 10);
      all.set(tier, (all.get(tier) ?? 0) + row.matches);
      if (row.hero_id !== heroId) continue;
      const agg = hero.get(tier) ?? { wins: 0, matches: 0 };
      agg.wins += row.wins;
      agg.matches += row.matches;
      hero.set(tier, agg);
    }
    const multiplier = getPickrateMultiplier(request.gameMode);
    return [...hero.entries()]
      .filter(([, agg]) => agg.matches >= MIN_TIER_MATCHES)
      .sort(([a], [b]) => a - b)
      .map(([tier, agg]): TierEntry => {
        const rank = rankByTier.get(tier);
        return {
          tier,
          name: rank?.name ?? `Tier ${tier}`,
          color: rank?.color ?? "var(--color-primary)",
          image: rank?.images.large_webp ?? rank?.images.large ?? undefined,
          winRate: agg.wins / agg.matches,
          pickRate: (multiplier * agg.matches) / (all.get(tier) ?? agg.matches),
          matches: agg.matches,
        };
      });
  }, [data, ranks, heroId, request.gameMode]);

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingLogo />
      </div>
    );
  }
  if (tiers.length === 0) return null;

  const best = tiers.reduce((a, b) => (b.winRate > a.winRate ? b : a));
  const worst = tiers.reduce((a, b) => (b.winRate < a.winRate ? b : a));

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">{heroName} Win Rate by Rank</h2>
      <p className="text-sm text-muted-foreground">
        {heroName} wins most at <span className="font-semibold text-foreground">{best.name}</span> ({pct(best.winRate)})
        and least at <span className="font-semibold text-foreground">{worst.name}</span> ({pct(worst.winRate)}). Each
        bar is one rank tier in the current patch; hover for pick rate and match count.
      </p>
      <figure aria-label={`${heroName} win rate by rank tier`}>
        <ResponsiveContainer width="100%" height={280} className="rounded-xl bg-muted p-2">
          <BarChart data={tiers} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
            <XAxis
              dataKey="tier"
              interval={0}
              height={48}
              tickLine={false}
              axisLine={false}
              tick={<RankTick tiers={tiers} />}
            />
            <YAxis
              domain={[(min: number) => Math.floor(min * 20) / 20, (max: number) => Math.ceil(max * 20) / 20]}
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
                        Win rate {pct(entry.winRate)} · Pick rate {pct(entry.pickRate)} ·{" "}
                        {entry.matches.toLocaleString("en-US")} matches
                      </div>
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="winRate" radius={4}>
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
