import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiGameStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { LoadingLogo } from "~/components/LoadingLogo";
import { gameStatsQueryOptions } from "~/queries/games-query";

import { formatPercent, formatSouls, SOUL_SOURCE_GROUPS } from "./economy-definitions";
import { formatStatValue } from "./stat-definitions";

interface EconomySoulSourcesProps {
  params: AnalyticsApiGameStatsRequest;
}

export default function EconomySoulSources({ params }: EconomySoulSourcesProps) {
  const { data, isPending } = useQuery(gameStatsQueryOptions({ ...params, bucket: "no_bucket" }));

  const stats = data?.[0];

  const breakdown = useMemo(() => {
    if (!stats) return [];
    const rows = SOUL_SOURCE_GROUPS.map((group) => {
      const base = (stats[group.baseKey] as number) ?? 0;
      const orb = group.orbKey ? ((stats[group.orbKey] as number) ?? 0) : 0;
      const value = base + orb;
      return {
        key: group.key,
        label: group.label,
        color: group.color,
        value,
        orbShare: value > 0 ? orb / value : 0,
      };
    });
    const total = rows.reduce((sum, r) => sum + r.value, 0);
    return rows.map((r) => ({ ...r, share: total > 0 ? r.value / total : 0 })).sort((a, b) => b.value - a.value);
  }, [stats]);

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingLogo />
      </div>
    );
  }

  if (!stats || breakdown.length === 0) {
    return <div className="py-8 text-center text-sm text-muted-foreground">No data available.</div>;
  }

  const totalFromSources = breakdown.reduce((sum, r) => sum + r.value, 0);
  const totalOrbs = SOUL_SOURCE_GROUPS.reduce((sum, g) => sum + (g.orbKey ? ((stats[g.orbKey] as number) ?? 0) : 0), 0);
  const orbSecured = totalFromSources > 0 ? totalOrbs / totalFromSources : 0;
  const durationS = (stats.avg_duration_s as number) ?? 0;
  const netWorth = (stats.avg_net_worth as number) ?? 0;
  const soulsPerMin = durationS > 0 ? netWorth / (durationS / 60) : 0;

  const tiles = [
    { label: "Net Worth", value: formatSouls(netWorth), hint: "Average final net worth per player" },
    { label: "Souls / Min", value: formatSouls(soulsPerMin), hint: "Average net worth divided by match length" },
    { label: "Match Length", value: formatStatValue(durationS, "duration"), hint: "Average match duration" },
    { label: "Orb-Secured", value: formatPercent(orbSecured), hint: "Share of soul income secured from soul orbs" },
    {
      label: "Denied to Enemies",
      value: formatSouls((stats.avg_gold_denied as number) ?? 0),
      hint: "Souls you shot away so the enemy couldn't secure them",
    },
    {
      label: "Lost on Death",
      value: formatSouls((stats.avg_gold_death_loss as number) ?? 0),
      hint: "Souls dropped to the enemy when you died",
    },
  ];

  return (
    <div className="flex h-full flex-col justify-between gap-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-center"
            title={tile.hint}
          >
            <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{tile.label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{tile.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <div className="relative mx-auto aspect-square w-full max-w-[210px] shrink-0 [&_*]:outline-none">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={breakdown}
                dataKey="value"
                nameKey="label"
                innerRadius="62%"
                outerRadius="100%"
                paddingAngle={2}
                stroke="none"
                isAnimationActive={false}
                tabIndex={-1}
                style={{ outline: "none" }}
              >
                {breakdown.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs tracking-wider text-muted-foreground uppercase">Soul Income</span>
            <span className="text-2xl font-bold tabular-nums">{formatSouls(totalFromSources)}</span>
            <span className="text-xs text-muted-foreground">per player</span>
          </div>
        </div>

        <ul className="flex w-full flex-1 flex-col gap-3">
          {breakdown.map((row) => (
            <li key={row.key} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: row.color }} />
                <span className="flex-1 text-sm">{row.label}</span>
                <span className="text-sm font-semibold tabular-nums">{formatSouls(row.value)}</span>
                <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
                  {formatPercent(row.share)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${row.share * 100}%`, backgroundColor: row.color }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
