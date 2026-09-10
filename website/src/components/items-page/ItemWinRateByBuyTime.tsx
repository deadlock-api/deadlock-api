import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiItemStatsRequest } from "deadlock_api_client";
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
import { LOSS_COLOR, WIN_COLOR } from "~/components/tracker-page/shared/colors";
import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { percentTicks, winRateDomain } from "~/lib/chart-axis";
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
      .map(
        ([start, bin]): BinEntry => ({
          label: `${start}–${start + width}m`,
          tick: `${start}m`,
          winRate: bin.wins / bin.matches,
          matches: bin.matches,
          share: bin.matches / total,
        }),
      );
    if (entries.length > best.length) best = entries;
    if (entries.length >= MIN_BINS) break;
  }
  return best;
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

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingLogo />
      </div>
    );
  }
  if (entries.length < 2) return null;

  const early = entries[0];
  const late = entries[entries.length - 1];
  const peak = entries.reduce((a, b) => (b.share > a.share ? b : a));
  const winRateAxis = winRateDomain(entries.map((entry) => entry.winRate));

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">When to Buy {itemName}</h2>
      <p className="text-sm text-muted-foreground">
        Most players pick up {itemName} at <span className="font-semibold text-foreground">{peak.label}</span> (
        {formatPercent(peak.share, 0)} of purchases). Buyers at {early.label} win {formatPercent(early.winRate)}, versus{" "}
        {formatPercent(late.winRate)} at {late.label}. An early buy partly reflects a team that is already ahead, so
        read this as when the item tends to pay off rather than proof that rushing it wins.
      </p>
      <figure aria-label={`${itemName} win rate by purchase time`}>
        <ResponsiveContainer width="100%" height={280} className="rounded-xl bg-muted p-2">
          <BarChart data={entries} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
            <XAxis dataKey="tick" interval={0} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <YAxis
              domain={winRateAxis}
              ticks={percentTicks(winRateAxis)}
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
                const entry = payload[0].payload as BinEntry;
                return (
                  <div className="rounded-md bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md">
                    <div className="font-medium">Bought at {entry.label}</div>
                    <div className="text-muted-foreground">
                      Win rate {formatPercent(entry.winRate)} · {formatPercent(entry.share, 0)} of purchases ·{" "}
                      {entry.matches.toLocaleString("en-US")} matches
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="winRate" radius={4}>
              {entries.map((entry) => (
                <Cell key={entry.tick} fill={entry.winRate >= 0.5 ? WIN_COLOR : LOSS_COLOR} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </figure>
    </section>
  );
}
