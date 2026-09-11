import { useQuery } from "@tanstack/react-query";
import type { HashMapValue } from "deadlock_api_client";
import { ChartNoAxesCombined, RefreshCw } from "lucide-react";
import { useState } from "react";

import {
  formatPlayerMetricValue,
  PLAYER_METRICS,
  type PlayerMetricDefinition,
} from "~/components/players-page/player-metric-definitions";
import { MODE_CONFIG } from "~/components/selectors/ModeSelector";
import { Button } from "~/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { benchmarkRankRange, compareBenchmark } from "~/lib/tracker/benchmarks";
import type { TrackerFilterValues } from "~/lib/tracker/compute";
import { cn } from "~/lib/utils";
import { playerStatsMetricsQueryOptions } from "~/queries/player-stats-metrics-query";
import { ranksQueryOptions } from "~/queries/ranks-query";

import { MetricGaussian } from "./MetricGaussian";
import { OverviewDetailPanel } from "./OverviewDetailPanel";

const PRIMARY_METRICS = [
  "kills",
  "deaths",
  "assists",
  "kda",
  "net_worth_per_min",
  "last_hits",
  "denies",
  "accuracy",
  "player_damage_per_min",
  "boss_damage_per_min",
  "healing_per_min",
  "crit_shot_rate",
];
const labels: Record<string, string> = {
  kda: "KDA / match",
  net_worth_per_min: "Souls / min",
  player_damage_per_min: "Hero damage / min",
  boss_damage_per_min: "Objective dmg / min",
  healing_per_min: "Healing / min",
  crit_shot_rate: "Critical shot rate",
};

export function RankBenchmarks({
  accountId,
  filters,
  latestBadge,
}: {
  accountId: number;
  filters: TrackerFilterValues;
  latestBadge: number | null;
}) {
  const { data: ranks = [] } = useQuery(ranksQueryOptions);
  const [selection, setSelection] = useState("auto");
  const mode = MODE_CONFIG[filters.mode];
  const autoRange = benchmarkRankRange(latestBadge);
  const range =
    mode.supportsRank && selection !== "all"
      ? selection === "auto"
        ? autoRange
        : benchmarkRankRange(Number(selection) * 10 + 1)
      : null;
  const needsRank = mode.supportsRank && selection === "auto" && !autoRange;
  const rank = ranks.find((r) => r.tier === range?.tier);
  const cohortLabel = range
    ? `${rank?.name ?? `Tier ${range.tier}`} 1–6`
    : mode.supportsRank
      ? "All ranks"
      : "Street Brawl";
  const enabled = !needsRank && filters.result === "all";
  const sharedParams = {
    gameMode: mode.gameMode,
    matchMode: mode.matchMode,
    heroIds: filters.heroId == null ? undefined : String(filters.heroId),
    minUnixTimestamp: filters.minUnixTimestamp ?? 0,
    maxUnixTimestamp: filters.maxUnixTimestamp ?? undefined,
  };
  const player = useQuery({
    ...playerStatsMetricsQueryOptions({ ...sharedParams, accountIds: [accountId] }),
    enabled,
    refetchOnMount: false,
  });
  const cohort = useQuery({
    ...playerStatsMetricsQueryOptions({ ...sharedParams, minAverageBadge: range?.min, maxAverageBadge: range?.max }),
    enabled,
    refetchOnMount: false,
  });
  const loading = enabled && (player.isPending || cohort.isPending);
  const failed = enabled && (player.isError || cohort.isError);
  const renderContent = (expanded: boolean) => {
    const metrics = expanded
      ? PLAYER_METRICS
      : PRIMARY_METRICS.flatMap((key) => PLAYER_METRICS.filter((m) => m.key === key));
    const hasData = metrics.some((m) => compareBenchmark(player.data?.[m.key]?.avg, cohort.data?.[m.key]?.avg));

    return (
      <>
        {filters.result !== "all" ? (
          <p className="py-3 text-xs text-muted-foreground">
            Choose “All” results to compare performance. Rank benchmarks cannot be filtered to wins or losses.
          </p>
        ) : needsRank ? (
          <p className="py-3 text-xs text-muted-foreground">
            No rank is recorded for this player. Choose a rank range above to compare against a lobby average.
          </p>
        ) : loading ? (
          <output
            aria-label="Loading rank benchmarks"
            className="grid grid-cols-2 gap-2 @xl/overview:grid-cols-3 @3xl/overview:grid-cols-4 @5xl/overview:grid-cols-6"
          >
            {PRIMARY_METRICS.map((key) => (
              <Skeleton key={key} className={cn("w-full", expanded ? "h-32" : "h-14")} />
            ))}
          </output>
        ) : failed ? (
          <div className="flex flex-wrap items-center justify-between gap-2 py-2">
            <output className="text-xs text-muted-foreground">Rank benchmarks couldn’t be loaded.</output>
            <Button
              variant="outline"
              size="sm"
              disabled={player.isFetching || cohort.isFetching}
              onClick={() => {
                void player.refetch();
                void cohort.refetch();
              }}
            >
              <RefreshCw data-icon="inline-start" />
              Retry
            </Button>
          </div>
        ) : !hasData ? (
          <p className="py-3 text-xs text-muted-foreground">
            No recorded match statistics are available for this comparison. Try another date or rank range.
          </p>
        ) : (
          <>
            {expanded && (
              <div className="mb-2 flex flex-wrap items-center justify-between gap-1 text-[10px] text-muted-foreground">
                <span>Player averages vs. {cohortLabel} lobby averages</span>
                <span className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <span className="size-1.5 rounded-sm bg-chart-4" />
                    Player
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-1.5 rounded-sm bg-muted-foreground" />
                    Rank group
                  </span>
                </span>
              </div>
            )}
            <div
              className={cn(
                "grid grid-cols-2 gap-2",
                expanded
                  ? "@xl/stats-dialog:grid-cols-3 @4xl/stats-dialog:grid-cols-4"
                  : "@xl/overview:grid-cols-3 @3xl/overview:grid-cols-4 @5xl/overview:grid-cols-6",
              )}
            >
              {metrics.map((def) => (
                <BenchmarkMetric
                  key={def.key}
                  def={def}
                  showDistribution={expanded}
                  player={player.data?.[def.key]}
                  cohort={cohort.data?.[def.key]}
                />
              ))}
            </div>
          </>
        )}
      </>
    );
  };

  return (
    <OverviewDetailPanel
      title="Rank benchmarks"
      showMetaInDialog
      details={() => renderContent(true)}
      footer="Player averages / rank group averages"
      icon={ChartNoAxesCombined}
      meta={
        mode.supportsRank ? (
          <Select value={selection} onValueChange={setSelection}>
            <SelectTrigger size="sm" className="h-7 min-w-40 gap-2" aria-label="Benchmark rank range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="auto">
                  {autoRange
                    ? `Auto · ${ranks.find((r) => r.tier === autoRange.tier)?.name ?? `Tier ${autoRange.tier}`} 1–6`
                    : "Auto · no recorded rank"}
                </SelectItem>
                <SelectItem value="all">All ranks</SelectItem>
                {ranks
                  .filter((r) => r.tier >= 1 && r.tier <= 11)
                  .map((r) => (
                    <SelectItem key={r.tier} value={String(r.tier)}>
                      {r.name} 1–6
                    </SelectItem>
                  ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : (
          "Street Brawl · all players"
        )
      }
    >
      {renderContent(false)}
    </OverviewDetailPanel>
  );
}

function BenchmarkMetric({
  def,
  player,
  cohort,
  showDistribution,
}: {
  def: PlayerMetricDefinition;
  showDistribution: boolean;
  player: HashMapValue | undefined;
  cohort: HashMapValue | undefined;
}) {
  const comparison = compareBenchmark(player?.avg, cohort?.avg);
  const format = (value: number | null | undefined) =>
    value != null && Number.isFinite(value) ? formatPlayerMetricValue(value, def.format) : "—";
  const favorable = comparison && (def.key === "deaths" ? comparison.delta < 0 : comparison.delta > 0);
  // Damage taken is contextual: a higher value alone is neither better nor worse.
  const neutral = def.key === "player_damage_taken_per_min";
  const difference = comparison?.relativeDelta;
  return (
    <div className="min-w-0 rounded-md border border-border/60 px-2 pt-1 pb-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="flex w-full min-w-0 flex-col gap-1 rounded-sm py-1 text-left hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
            aria-label={`${labels[def.key] ?? def.label}: player ${format(player?.avg)}, lobby average ${format(cohort?.avg)}`}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="truncate text-[11px] text-muted-foreground">{labels[def.key] ?? def.label}</span>
              {difference != null && (
                <span
                  className={cn(
                    "text-[10px] tabular-nums",
                    difference === 0 || neutral ? "text-muted-foreground" : favorable ? "text-victory" : "text-primary",
                  )}
                >
                  {difference > 0 ? "+" : ""}
                  {(difference * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <div className="flex w-full items-center justify-between gap-2">
              <span className="w-14 shrink-0 text-xs font-semibold tabular-nums">{format(player?.avg)}</span>
              <span className="w-14 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">
                {format(cohort?.avg)}
              </span>
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col gap-1">
            <strong>{def.label} · per-match averages</strong>
            <span>
              Player: {format(player?.avg)} · Lobby: {format(cohort?.avg)}
            </span>
            <span>Lobby median: {format(cohort?.percentile50)}</span>
            <span>
              Middle 50% of lobby match performances: {format(cohort?.percentile25)}–{format(cohort?.percentile75)}
            </span>
            {def.key === "deaths" && <span>Fewer deaths is better.</span>}
            {def.key === "kda" && <span>Mean of each match’s KDA; differs from the overall KDA ratio above.</span>}
          </div>
        </TooltipContent>
      </Tooltip>
      {showDistribution && (
        <MetricGaussian
          player={player}
          cohort={cohort}
          label={def.label}
          format={format}
          bounded={def.format === "percent"}
        />
      )}
    </div>
  );
}
