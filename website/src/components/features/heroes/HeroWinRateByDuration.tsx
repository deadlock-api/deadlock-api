import { useQueries } from "@tanstack/react-query";
import type { AnalyticsApiHeroStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import { ChartCard } from "~/components/patterns/charts/ChartCard";
import { ChartEmpty, ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { WinRateBarChart } from "~/components/patterns/charts/WinRateBarChart";
import { PanelBody } from "~/components/patterns/panel/Panel";
import { TooltipCard, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { useDefaultPeriodLabel } from "~/hooks/useDefaultPeriodLabel";
import { DURATION_BUCKETS } from "~/lib/constants";
import { formatPercent } from "~/lib/format";
import type { GameMode } from "~/lib/game-mode";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";

const MIN_BUCKET_MATCHES = 100;

interface DurationEntry {
  label: string;
  /** Bracket start only, so seven ticks still fit on a phone-width axis. */
  tick: string;
  winRate: number;
  matches: number;
  /** Share of the hero's matches that ended in this duration bucket. */
  share: number;
}

function DurationTooltip({ entry }: { entry?: DurationEntry }) {
  if (!entry) return null;
  return (
    <TooltipCard>
      <TooltipHeader title={entry.label} />
      <TooltipStats>
        <TooltipStat label="Win rate" value={formatPercent(entry.winRate)} />
        <TooltipStat label="Share of games" value={formatPercent(entry.share, 0)} />
        <TooltipStat label="Matches" value={entry.matches.toLocaleString("en-US")} />
      </TooltipStats>
    </TooltipCard>
  );
}

export function HeroWinRateByDuration({
  heroId,
  heroName,
  request,
  rankRange,
  className,
}: {
  className?: string;
  heroId: number;
  heroName: string;
  request: Omit<AnalyticsApiHeroStatsRequest, "gameMode"> & { gameMode?: GameMode };
  /** The request's rank range in words, such as "Phantom 1+". */
  rankRange: string;
}) {
  const period = useDefaultPeriodLabel();
  const { rows, isPending, failed } = useQueries({
    queries: DURATION_BUCKETS.map((bucket) => {
      const params = { ...request, minDurationS: bucket.minS, maxDurationS: bucket.maxS, bucket: "no_bucket" as const };
      return heroStatsQueryOptions(params);
    }),
    combine: (queries) => ({
      rows: queries.map((q) => q.data?.find((row) => row.hero_id === heroId)),
      isPending: queries.some((q) => q.isPending),
      // A missing bracket would skew the shares and the early/late comparison, so any failure fails the section.
      failed: queries.filter((q) => q.isError && !q.data),
    }),
  });

  const entries = useMemo(() => {
    const total = rows.reduce((sum, row) => sum + (row?.matches ?? 0), 0);
    return DURATION_BUCKETS.flatMap((bucket, i) => {
      const row = rows[i];
      if (!row || row.matches < MIN_BUCKET_MATCHES) return [];
      const entry: DurationEntry = {
        label: bucket.label,
        tick: i === 0 ? `<${bucket.maxS / 60}m` : `${bucket.minS / 60}m${i === DURATION_BUCKETS.length - 1 ? "+" : ""}`,
        winRate: row.wins / row.matches,
        matches: row.matches,
        share: row.matches / total,
      };
      return [entry];
    });
  }, [rows]);

  const early = entries[0];
  const late = entries.at(-1);
  const delta = early && late ? late.winRate - early.winRate : 0;
  const verdict =
    Math.abs(delta) < 0.02
      ? `${heroName} wins about as often in short games as in long ones`
      : delta > 0
        ? `${heroName} scales into the late game`
        : `${heroName} falls off in longer games`;
  const chartLabel = `${heroName} win rate by match duration`;

  return (
    <ChartCard
      className={className}
      title="Win Rate by Match Length"
      description={`${rankRange} · ${period}`}
      footer={
        early &&
        late &&
        entries.length >= 2 && (
          <>
            {verdict}: {formatPercent(early.winRate)} in {early.label} games versus {formatPercent(late.winRate)} in{" "}
            {late.label} games.
          </>
        )
      }
    >
      <PanelBody size="sm">
        {failed.length > 0 ? (
          <ChartError
            label="win rate by match duration"
            retrying={failed.some((q) => q.isFetching)}
            onRetry={() => failed.forEach((q) => void q.refetch())}
          />
        ) : isPending ? (
          <ChartLoading label={chartLabel} />
        ) : entries.length < 2 ? (
          <ChartEmpty label="match lengths with enough games" />
        ) : (
          <WinRateBarChart
            variant="flush"
            label={chartLabel}
            data={entries}
            xKey="tick"
            valueKey="winRate"
            tooltip={<DurationTooltip />}
          />
        )}
      </PanelBody>
    </ChartCard>
  );
}
