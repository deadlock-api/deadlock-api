import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiItemStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import { ChartCard } from "~/components/patterns/charts/ChartCard";
import { ChartEmpty, ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { WinRateBarChart } from "~/components/patterns/charts/WinRateBarChart";
import { PanelBody } from "~/components/patterns/panel/Panel";
import { TooltipCard, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { formatPercent } from "~/lib/format";
import { queryKeys } from "~/queries/query-keys";

/** Widest first: tier 4 items spread over half an hour, while starter items are all bought in the first few minutes. */
const BIN_WIDTHS_MIN = [5, 2, 1];
const MIN_BINS = 4;
const MIN_BIN_MATCHES = 100;
const MIN_BIN_SHARE = 0.02;

interface BinEntry {
  label: string;
  tick: string;
  winRate: number;
  matches: number;
  /** Share of the item's purchases that fall in this bin. */
  share: number;
}

function binByBuyMinute(rows: readonly { bucket: number; wins: number; matches: number }[]): BinEntry[] {
  const total = rows.reduce((sum, row) => sum + row.matches, 0);
  let best: BinEntry[] = [];
  for (const width of BIN_WIDTHS_MIN) {
    const bins = new Map<number, { wins: number; matches: number }>();
    for (const row of rows) {
      const start = Math.floor(row.bucket / width) * width;
      const bin = bins.get(start) ?? { wins: 0, matches: 0 };
      bin.wins += row.wins;
      bin.matches += row.matches;
      bins.set(start, bin);
    }
    const entries = [...bins.entries()]
      .filter(([, bin]) => bin.matches >= MIN_BIN_MATCHES && bin.matches / total >= MIN_BIN_SHARE)
      .sort(([a], [b]) => a - b)
      .map(([start, bin]): BinEntry => ({
        label: `${start}–${start + width}m`,
        tick: `${start}m`,
        winRate: bin.wins / bin.matches,
        matches: bin.matches,
        share: bin.matches / total,
      }));
    if (entries.length > best.length) best = entries;
    if (entries.length >= MIN_BINS) break;
  }
  return best;
}

function BinTooltip({ entry }: { entry?: BinEntry }) {
  if (!entry) return null;
  return (
    <TooltipCard>
      <TooltipHeader title={`Bought at ${entry.label}`} />
      <TooltipStats>
        <TooltipStat label="Win rate" value={formatPercent(entry.winRate)} />
        <TooltipStat label="Of purchases" value={formatPercent(entry.share, 0)} />
        <TooltipStat label="Matches" value={entry.matches.toLocaleString("en-US")} />
      </TooltipStats>
    </TooltipCard>
  );
}

export function ItemWinRateByBuyTime({
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
  // No per-minute minimum: the API applies it to each minute, so rare minutes dropped out of the shares and the peak.
  const params = { ...request, bucket: "game_time_min" as const, minMatches: undefined };
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: queryKeys.analytics.itemStats(params),
    queryFn: async () => (await api.analytics_api.itemStats(params)).data,
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });

  const entries = useMemo(() => binByBuyMinute(data?.filter((row) => row.item_id === itemId) ?? []), [data, itemId]);

  const early = entries[0];
  const late = entries.at(-1);
  const peak = entries.length > 0 ? entries.reduce((a, b) => (b.share > a.share ? b : a)) : undefined;
  const chartLabel = `${itemName} win rate by purchase time`;

  return (
    <ChartCard
      className={className}
      title="When to Buy"
      description="Win rate by purchase minute"
      footer={
        early &&
        late &&
        peak &&
        entries.length >= 2 && (
          <>
            {/* The largest bucket is often well under half of all purchases, so it is "most often", not "most players". */}
            Bought most often at {peak.label} ({formatPercent(peak.share, 0)} of purchases). Buyers at {early.label} win{" "}
            {formatPercent(early.winRate)}, versus {formatPercent(late.winRate)} at {late.label}. An early buy partly
            reflects a team already ahead, so read it as when the item pays off, not proof that rushing it wins.
          </>
        )
      }
    >
      <PanelBody size="sm">
        {isError && !data ? (
          <ChartError label="purchase timings" retrying={isFetching} onRetry={() => void refetch()} />
        ) : isPending ? (
          <ChartLoading label={chartLabel} />
        ) : entries.length < 2 ? (
          <ChartEmpty label="purchase timings" />
        ) : (
          <WinRateBarChart
            variant="flush"
            label={chartLabel}
            data={entries}
            xKey="tick"
            valueKey="winRate"
            tooltip={<BinTooltip />}
          />
        )}
      </PanelBody>
    </ChartCard>
  );
}
