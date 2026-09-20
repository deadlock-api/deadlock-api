import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiGameStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";
import { Cell, Pie, PieChart } from "recharts";

import { ChartSwatch } from "~/components/patterns/charts/ChartLegend";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { ProgressBar } from "~/components/ui/progress-bar";
import { Stat, StatGroup } from "~/components/ui/stat";
import { gameStatsQueryOptions } from "~/queries/games-query";

import { formatPercent, formatSouls, SOUL_SOURCE_GROUPS } from "./economy-definitions";
import { formatStatValue } from "./stat-definitions";

interface EconomySoulSourcesProps {
  params: AnalyticsApiGameStatsRequest;
}

export default function EconomySoulSources({ params }: EconomySoulSourcesProps) {
  const { data, isPending, isError, isFetching, refetch } = useQuery(
    gameStatsQueryOptions({ ...params, bucket: "no_bucket" }),
  );

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
        share: 0,
      };
    });
    const total = rows.reduce((sum, r) => sum + r.value, 0);
    for (const row of rows) {
      row.share = total > 0 ? row.value / total : 0;
    }
    return rows.sort((a, b) => b.value - a.value);
  }, [stats]);

  if (isPending) {
    return <LoadingState label="soul sources" className="flex items-center justify-center py-16" />;
  }

  if (isError) {
    return <ErrorState retrying={isFetching} onRetry={() => void refetch()} />;
  }

  if (!stats || breakdown.length === 0) {
    return <EmptyState variant="inline" title="No data available." />;
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
    <div className="@container flex h-full flex-col justify-between gap-5">
      <StatGroup variant="joined" size="sm" className="grid-cols-2 sm:grid-cols-3">
        {tiles.map((tile) => (
          <Stat key={tile.label} label={tile.label} value={tile.value} align="center" title={tile.hint} />
        ))}
      </StatGroup>

      <div className="flex flex-col items-center gap-6 @md:flex-row">
        <div className="relative mx-auto aspect-square w-full max-w-52.5 shrink-0">
          <ChartSurface label="Soul income by source" size="fill" variant="bare">
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
              >
                {breakdown.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ChartSurface>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="eyebrow">Soul Income</span>
            <span className="text-2xl font-bold tabular-nums">{formatSouls(totalFromSources)}</span>
            <span className="text-xs text-muted-foreground">per player</span>
          </div>
        </div>

        <ul className="flex w-full min-w-0 flex-1 flex-col gap-3">
          {breakdown.map((row) => (
            <li key={row.key} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <ChartSwatch color={row.color} />
                <span className="flex-1 text-sm">{row.label}</span>
                <span className="text-sm font-semibold tabular-nums">{formatSouls(row.value)}</span>
                <span className="w-12 text-end text-xs text-muted-foreground tabular-nums">
                  {formatPercent(row.share)}
                </span>
              </div>
              <ProgressBar value={row.share} color={row.color} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
