import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiGameStatsRequest, Rank } from "deadlock_api_client";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { LoadingLogo } from "~/components/LoadingLogo";
import { cn } from "~/lib/utils";
import { gameStatsQueryOptions } from "~/queries/games-query";
import { ranksQueryOptions } from "~/queries/ranks-query";

import { formatPercent, formatSouls, formatSoulsCompact, groupSouls, SOUL_SOURCE_GROUPS } from "./economy-definitions";

interface EconomySourcesByRankProps {
  params: AnalyticsApiGameStatsRequest;
}

type Mode = "share" | "souls";

interface TierRow {
  tier: number;
  name: string;
  image: string | undefined;
  total: number;
  souls: Record<string, number>;
  share: Record<string, number>;
}

export default function EconomySourcesByRank({ params }: EconomySourcesByRankProps) {
  const [mode, setMode] = useState<Mode>("share");
  const { data, isPending } = useQuery(gameStatsQueryOptions({ ...params, bucket: "avg_badge" }));
  const { data: ranksData } = useQuery(ranksQueryOptions);

  const tierData = useMemo(() => {
    const map = new Map<number, Rank>();
    ranksData?.forEach((r) => map.set(r.tier, r));
    return map;
  }, [ranksData]);

  const chartData = useMemo<TierRow[]>(() => {
    if (!data) return [];

    const tiers = new Map<number, { weight: number; souls: Record<string, number> }>();
    for (const entry of data) {
      if (entry.bucket <= 0) continue;
      const tier = Math.floor(entry.bucket / 10);
      const weight = entry.total_matches || 0;
      if (weight <= 0) continue;
      const acc = tiers.get(tier) ?? { weight: 0, souls: {} };
      acc.weight += weight;
      for (const group of SOUL_SOURCE_GROUPS) {
        acc.souls[group.key] = (acc.souls[group.key] ?? 0) + groupSouls(entry, group) * weight;
      }
      tiers.set(tier, acc);
    }

    return Array.from(tiers.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([tier, acc]) => {
        const souls: Record<string, number> = {};
        let total = 0;
        for (const group of SOUL_SOURCE_GROUPS) {
          const avg = acc.weight > 0 ? (acc.souls[group.key] ?? 0) / acc.weight : 0;
          souls[group.key] = avg;
          total += avg;
        }
        const share: Record<string, number> = {};
        for (const group of SOUL_SOURCE_GROUPS) {
          share[group.key] = total > 0 ? (souls[group.key] / total) * 100 : 0;
        }
        const rank = tierData.get(tier);
        return {
          tier,
          name: rank?.name ?? `Tier ${tier}`,
          image: rank?.images?.large_webp ?? rank?.images?.large ?? undefined,
          total,
          souls,
          share,
        };
      });
  }, [data, tierData]);

  const tierName = useMemo(() => {
    const map = new Map<number, string>();
    chartData.forEach((r) => map.set(r.tier, r.name));
    return map;
  }, [chartData]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end gap-1 self-end rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5">
        {(
          [
            { value: "share", label: "Share" },
            { value: "souls", label: "Souls" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setMode(opt.value)}
            className={cn(
              "cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              mode === opt.value
                ? "bg-white/[0.1] text-foreground"
                : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div aria-live="polite" aria-busy={isPending}>
        {isPending ? (
          <div className="flex items-center justify-center py-16">
            <LoadingLogo />
          </div>
        ) : chartData.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No data available.</div>
        ) : (
          <figure aria-label="Soul sources by rank chart">
            <ResponsiveContainer width="100%" height={340} className="rounded-xl bg-muted p-2 [&_*]:outline-none">
              <BarChart data={chartData} margin={{ top: 16, right: 16, bottom: 24, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
                <XAxis
                  dataKey="tier"
                  interval={0}
                  height={44}
                  angle={-30}
                  textAnchor="end"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(tier: number) => tierName.get(tier) ?? String(tier)}
                  stroke="#525252"
                />
                <YAxis
                  stroke="#525252"
                  allowDecimals={mode !== "share"}
                  domain={mode === "share" ? [0, 100] : [0, "auto"]}
                  ticks={mode === "share" ? [0, 25, 50, 75, 100] : undefined}
                  tickFormatter={(v: number) => (mode === "share" ? `${Math.round(v)}%` : formatSoulsCompact(v))}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0].payload as TierRow;
                    return (
                      <div className="rounded-md bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
                        <div className="mb-1.5 flex items-center gap-2 font-medium">
                          {row.image && <img src={row.image} alt="" className="size-5" />}
                          {row.name}
                        </div>
                        <div className="flex flex-col gap-0.5">
                          {[...SOUL_SOURCE_GROUPS]
                            .sort((a, b) => row.souls[b.key] - row.souls[a.key])
                            .map((group) => (
                              <div key={group.key} className="flex items-center gap-2">
                                <span className="size-2.5 rounded-sm" style={{ backgroundColor: group.color }} />
                                <span className="flex-1">{group.label}</span>
                                <span className="tabular-nums">
                                  {formatSouls(row.souls[group.key])}
                                  <span className="ml-1.5 text-muted-foreground">
                                    {formatPercent(row.share[group.key] / 100)}
                                  </span>
                                </span>
                              </div>
                            ))}
                          <div className="mt-1 flex items-center gap-2 border-t border-white/10 pt-1 font-medium">
                            <span className="flex-1">Total</span>
                            <span className="tabular-nums">{formatSouls(row.total)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
                {SOUL_SOURCE_GROUPS.map((group) => (
                  <Bar
                    key={group.key}
                    dataKey={(row: TierRow) => (mode === "share" ? row.share[group.key] : row.souls[group.key])}
                    name={group.label}
                    stackId="souls"
                    fill={group.color}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </figure>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {SOUL_SOURCE_GROUPS.map((group) => (
          <div key={group.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: group.color }} />
            {group.label}
          </div>
        ))}
      </div>
    </div>
  );
}
