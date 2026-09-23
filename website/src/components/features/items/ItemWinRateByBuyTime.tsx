import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiItemStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import { ChartLoading } from "~/components/patterns/charts/ChartStates";
import { WinRateBarChart } from "~/components/patterns/charts/WinRateBarChart";
import { Section } from "~/components/patterns/page/Section";
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
}: {
  itemId: number;
  itemName: string;
  request: AnalyticsApiItemStatsRequest;
}) {
  const params = { ...request, bucket: "game_time_min" as const };
  const { data, isPending } = useQuery({
    queryKey: queryKeys.analytics.itemStats(params),
    queryFn: async () => (await api.analytics_api.itemStats(params)).data,
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });

  const entries = useMemo(() => binByBuyMinute(data?.filter((row) => row.item_id === itemId) ?? []), [data, itemId]);

  if (isPending) return <ChartLoading label={`${itemName} win rate by purchase time`} />;
  if (entries.length < 2) return null;

  const early = entries[0];
  const late = entries[entries.length - 1];
  const peak = entries.reduce((a, b) => (b.share > a.share ? b : a));

  return (
    <Section
      title={`When to Buy ${itemName}`}
      description={
        <>
          {/* The largest bucket is often well under half of all purchases, so it is "most often", not "most players". */}
          {itemName} is bought most often at <span className="font-semibold text-foreground">{peak.label}</span> (
          {formatPercent(peak.share, 0)} of purchases). Buyers at {early.label} win {formatPercent(early.winRate)},
          versus {formatPercent(late.winRate)} at {late.label}. An early buy partly reflects a team that is already
          ahead, so read this as when the item tends to pay off rather than proof that rushing it wins.
        </>
      }
    >
      <WinRateBarChart
        label={`${itemName} win rate by purchase time`}
        data={entries}
        xKey="tick"
        valueKey="winRate"
        tooltip={<BinTooltip />}
      />
    </Section>
  );
}
