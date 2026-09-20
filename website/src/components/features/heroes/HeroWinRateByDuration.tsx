import { useQueries } from "@tanstack/react-query";
import type { AnalyticsApiHeroStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import type { GameMode } from "~/components/domain/selectors/GameModeSelector";
import { WinRateBarChart } from "~/components/patterns/charts/WinRateBarChart";
import { Section } from "~/components/patterns/page/Section";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { TooltipCard, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { DURATION_BUCKETS } from "~/lib/constants";
import { formatPercent, possessive } from "~/lib/format";
import { queryKeys } from "~/queries/query-keys";

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
}: {
  heroId: number;
  heroName: string;
  request: Omit<AnalyticsApiHeroStatsRequest, "gameMode"> & { gameMode?: GameMode };
}) {
  const { rows, isPending } = useQueries({
    queries: DURATION_BUCKETS.map((bucket) => {
      const params = { ...request, minDurationS: bucket.minS, maxDurationS: bucket.maxS, bucket: "no_bucket" as const };
      return {
        queryKey: queryKeys.analytics.heroStatsByDuration(params),
        queryFn: async () => (await api.analytics_api.heroStats(params)).data,
        staleTime: CACHE_DURATIONS.ONE_DAY,
      };
    }),
    combine: (queries) => ({
      rows: queries.map((q) => q.data?.find((row) => row.hero_id === heroId)),
      isPending: queries.some((q) => q.isPending),
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

  if (isPending) {
    return <LoadingState label="win rate by match duration" align="center" className="py-8" />;
  }
  if (entries.length < 2) return null;

  const early = entries[0];
  const late = entries[entries.length - 1];
  const delta = late.winRate - early.winRate;
  const verdict =
    Math.abs(delta) < 0.02
      ? `${heroName} wins about as often in short games as in long ones`
      : delta > 0
        ? `${heroName} scales into the late game`
        : `${heroName} falls off in longer games`;

  return (
    <Section
      title={`${heroName} Win Rate by Match Duration`}
      description={
        <>
          <span className="font-semibold text-foreground">{verdict}</span>: {formatPercent(early.winRate)} in{" "}
          {early.label} games versus {formatPercent(late.winRate)} in {late.label} games. Each bar is one duration
          bracket in the current patch; hover for how many of {possessive(heroName)} games end there.
        </>
      }
    >
      <WinRateBarChart
        label={`${heroName} win rate by match duration`}
        data={entries}
        xKey="tick"
        valueKey="winRate"
        tooltip={<DurationTooltip />}
      />
    </Section>
  );
}
