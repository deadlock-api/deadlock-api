import { useQuery } from "@tanstack/react-query";
import type { HashMapValue } from "deadlock_api_client";
import { ChartNoAxesCombined } from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";

import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { CHART_COLOR } from "~/components/patterns/charts/theme";
import { PanelWithDetails } from "~/components/patterns/panel/PanelWithDetails";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { Card } from "~/components/ui/card";
import { Delta } from "~/components/ui/delta";
import { DetailPopover } from "~/components/ui/detail-popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { MODE_CONFIG } from "~/lib/game-mode";
import { formatPlayerMetricValue, PLAYER_METRICS, type PlayerMetricDefinition } from "~/lib/player-metrics";
import { benchmarkRankRange, compareBenchmark } from "~/lib/tracker/benchmarks";
import type { TrackerFilterValues } from "~/lib/tracker/compute";
import { cn } from "~/lib/utils";
import { playerStatsMetricsQueryOptions } from "~/queries/player-stats-metrics-query";
import { ranksQueryOptions } from "~/queries/ranks-query";

import { MetricGaussian } from "./MetricGaussian";

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
const RANK_SELECTIONS = ["auto", "all", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"] as const;
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
  const [selection, setSelection] = useQueryState(
    "benchmark_rank",
    parseAsStringLiteral(RANK_SELECTIONS).withDefault("auto"),
  );
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
    const gridClassName = cn(
      "grid gap-2",
      expanded
        ? "grid-cols-1 @xs/stats-dialog:grid-cols-2 @xl/stats-dialog:grid-cols-3 @4xl/stats-dialog:grid-cols-4"
        : "grid-cols-2 @xl/overview:grid-cols-3 @3xl/overview:grid-cols-4 @5xl/overview:grid-cols-6",
    );

    return (
      <>
        {filters.result !== "all" ? (
          <EmptyState
            variant="inline"
            className="py-3 text-xs"
            title="Choose “All” results to compare performance. Rank benchmarks cannot be filtered to wins or losses."
          />
        ) : needsRank ? (
          <EmptyState
            variant="inline"
            className="py-3 text-xs"
            title="No rank is recorded for this player. Choose a rank range above to compare against a lobby average."
          />
        ) : loading ? (
          <output aria-label="Loading rank benchmarks" className={gridClassName}>
            {metrics.map(({ key }) => (
              <Skeleton key={key} className={cn("w-full", expanded ? "h-32" : "h-14")} />
            ))}
          </output>
        ) : failed ? (
          <ErrorState
            variant="inline"
            title="Rank benchmarks couldn’t be loaded"
            retrying={player.isFetching || cohort.isFetching}
            onRetry={() => {
              void player.refetch();
              void cohort.refetch();
            }}
          />
        ) : !hasData ? (
          <EmptyState
            variant="inline"
            className="py-3 text-xs"
            title="No recorded match statistics are available for this comparison. Try another date or rank range."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {expanded && (
              <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                <p>
                  Averages use the selected hero, mode and date range.
                  {mode.supportsRank &&
                    selection === "auto" &&
                    " Auto chooses your latest recorded rank across all dates and heroes."}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span>Player averages vs. {cohortLabel} lobby averages</span>
                  <ChartLegend className="px-0">
                    <ChartLegendItem color="var(--chart-4)" shape="line">
                      Player
                    </ChartLegendItem>
                    <ChartLegendItem color={CHART_COLOR.neutral} shape="line">
                      Lobby
                    </ChartLegendItem>
                  </ChartLegend>
                </div>
              </div>
            )}
            <div className={gridClassName}>
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
          </div>
        )}
      </>
    );
  };

  return (
    <PanelWithDetails
      title="Rank benchmarks"
      details={renderContent(true)}
      footer={
        mode.supportsRank && selection === "auto" && autoRange
          ? "Your average / lobby average · Auto uses your latest recorded rank"
          : "Your average / lobby average"
      }
      icon={ChartNoAxesCombined}
      actions={
        mode.supportsRank ? (
          <Select
            value={selection}
            onValueChange={(value) => {
              const next = RANK_SELECTIONS.find((option) => option === value);
              if (next) void setSelection(next);
            }}
          >
            <SelectTrigger size="sm" className="min-w-40 gap-2" aria-label="Benchmark rank range">
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
    </PanelWithDetails>
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
  // Damage taken is contextual: a higher value alone is neither better nor worse.
  const neutral = def.key === "player_damage_taken_per_min";
  const relativePercent = comparison?.relativeDelta == null ? null : Math.round(comparison.relativeDelta * 100);
  return (
    <Card tone="outline" size="xs" radius="md" className="gap-0 px-2 py-1">
      <DetailPopover
        label={`${labels[def.key] ?? def.label} benchmark`}
        size="sm"
        className="h-auto w-full min-w-0 flex-col items-stretch gap-1 px-0 py-1 text-start whitespace-normal"
        details={
          <>
            <TooltipHeader title={def.label} subtitle="Per-match averages" />
            <TooltipStats>
              <TooltipStat label="Your average" value={format(player?.avg)} />
              <TooltipStat label="Lobby average" value={format(cohort?.avg)} />
              <TooltipStat label="Lobby median" value={format(cohort?.percentile50)} />
              <TooltipStat
                label="Lobby middle 50%"
                value={`${format(cohort?.percentile25)}–${format(cohort?.percentile75)}`}
              />
            </TooltipStats>
            {def.key === "deaths" && <p className="text-xs text-muted-foreground">Fewer deaths is better.</p>}
            {def.key === "kda" && (
              <p className="text-xs text-muted-foreground">
                Mean of each match’s KDA; differs from the overall KDA ratio above.
              </p>
            )}
          </>
        }
      >
        {/* The label wraps instead of truncating: two tiles a row leave "Objective dmg / min" no room on a phone. */}
        <div className="flex w-full items-start justify-between gap-2">
          <span className="min-w-0 text-2xs text-muted-foreground">{labels[def.key] ?? def.label}</span>
          {relativePercent != null &&
            (relativePercent === 0 || neutral ? (
              <span className="text-3xs text-muted-foreground tabular-nums">
                {relativePercent > 0 ? "+" : ""}
                {relativePercent}%
              </span>
            ) : (
              <Delta
                value={relativePercent}
                format="number"
                digits={0}
                unit="%"
                polarity={def.key === "deaths" ? "lower-is-better" : "higher-is-better"}
                className="text-3xs"
              />
            ))}
        </div>
        <div className="flex w-full items-center justify-between gap-2">
          <span className="shrink-0 text-xs font-semibold tabular-nums">{format(player?.avg)}</span>
          <span className="shrink-0 text-end text-2xs text-muted-foreground tabular-nums">{format(cohort?.avg)}</span>
        </div>
      </DetailPopover>
      {showDistribution && (
        <MetricGaussian
          player={player}
          cohort={cohort}
          label={def.label}
          format={format}
          bounded={def.format === "percent"}
        />
      )}
    </Card>
  );
}
