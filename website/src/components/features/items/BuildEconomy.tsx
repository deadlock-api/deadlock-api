import { useQuery } from "@tanstack/react-query";
import { Coins } from "lucide-react";
import { useMemo, useState } from "react";
import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts";

import { RankedEntityList, RankedEntityMetric, RankedEntityRow } from "~/components/domain/assets/RankedEntityList";
import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { ChartEmpty, ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_COLOR,
  CHART_GRID,
  CHART_MARKER_LABEL,
  CHART_MARKER_LINE,
  CHART_TICK,
  CHART_X_AXIS,
  CHART_Y_AXIS,
} from "~/components/patterns/charts/theme";
import { Panel, PanelBody, PanelFooter, PanelHeader } from "~/components/patterns/panel/Panel";
import { Slider } from "~/components/ui/slider";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";
import { playerPerformanceCurveQueryOptions } from "~/queries/player-performance-curve-query";

// Must match TIME_PHASE_BOUNDARIES on the API: the build flow's stages, in seconds.
const STAGE_STARTS = [0, 540, 1200, 1800] as const;
const STAGE_LABELS = ["0–9m", "9–20m", "20–30m", "30m+"] as const;
// Selling refunds half an item's price.
const SELL_REFUND = 0.5;
// The plot ends here: few games run longer, and the curve's last points come from those few.
const END_S = 2700;
// The y-axis width in pixels: the flex slider under the plot is inset by the same (`ps-10`).
const Y_AXIS_WIDTH = 40;
const TICKS = [0, 300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700];

export interface EconomyItem {
  key: string;
  itemId: number;
  /** The build flow stage it was picked in. */
  column: number;
  cost: number;
  /** Its buyers' average net worth when they bought it in that stage. */
  netWorthAtBuy: number | null;
  /** The stage the build sells it in, if it does. */
  sellColumn: number | null;
}

interface BuildEconomyProps {
  title: React.ReactNode;
  items: EconomyItem[];
  /** When the three flex slots unlock, in minutes; the timeline marks them and its slider moves them. */
  flexMinutes: readonly number[];
  onFlexMinutesChange: (minutes: number[]) => void;
  heroId: number | null;
  gameMode?: GameMode;
  matchMode?: MatchMode;
  minRankId?: number;
  maxRankId?: number;
  minUnixTimestamp?: number;
  maxUnixTimestamp?: number;
}

interface Placed extends EconomyItem {
  /** Where the average net worth reaches `netWorthAtBuy`: when the item is bought on the soul curve. */
  boughtAt: number | null;
  soldShare: number | null;
  avgSellAt: number | null;
  /** Set when the build sells it: the sold mark's place. */
  sold: { at: number; souls: number } | null;
}

export interface SoulCurveFilters {
  heroId: number | null;
  gameMode?: GameMode;
  matchMode?: MatchMode;
  minRankId?: number;
  maxRankId?: number;
  minUnixTimestamp?: number;
  maxUnixTimestamp?: number;
}

type CurvePoint = { t: number; souls: number };

/** The hero's average net worth over the game (absolute time), from 0 at the start; one query for every reader. */
export function useSoulCurve(filters: SoulCurveFilters) {
  const curve = useQuery(
    playerPerformanceCurveQueryOptions({
      heroIds: filters.heroId != null ? String(filters.heroId) : undefined,
      gameMode: filters.gameMode,
      matchMode: filters.matchMode,
      minAverageBadge: filters.minRankId,
      maxAverageBadge: filters.maxRankId,
      minUnixTimestamp: filters.minUnixTimestamp,
      maxUnixTimestamp: filters.maxUnixTimestamp,
      resolution: 0,
    }),
  );
  const points = useMemo((): CurvePoint[] | null => {
    if (!curve.data || curve.data.length === 0) return null;
    return [
      { t: 0, souls: 0 },
      ...curve.data.map((p) => ({ t: p.game_time, souls: p.net_worth_avg })).sort((a, b) => a.t - b.t),
    ];
  }, [curve.data]);
  return { ...curve, points };
}

/** The average net worth at `t` seconds, read between the curve's points. */
export function soulsAt(points: CurvePoint[], t: number): number {
  const i = points.findIndex((p) => p.t >= t);
  if (i < 0) return points[points.length - 1].souls;
  if (i === 0) return points[0].souls;
  const a = points[i - 1];
  const b = points[i];
  return a.souls + ((b.souls - a.souls) * (t - a.t)) / (b.t - a.t);
}

/** Souls in a short form: "6.7k", "38k". */
export const compactSouls = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n));

/** A game time in seconds as "12:05". */
export const gameClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;

const clock = gameClock;
const compact = compactSouls;

/**
 * The build on the hero's soul curve: the average net worth over the game, each item where the curve reaches the net
 * worth its buyers had when they bought it, and a sold mark where the build sells it. Beside it each item's
 * price, that net worth and time, and how often or when it is sold.
 */
export function BuildEconomy({
  title,
  items,
  flexMinutes,
  onFlexMinutesChange,
  heroId,
  gameMode,
  matchMode,
  minRankId,
  maxRankId,
  minUnixTimestamp,
  maxUnixTimestamp,
}: BuildEconomyProps) {
  const filters = {
    heroIds: heroId != null ? String(heroId) : undefined,
    gameMode,
    matchMode,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp,
    maxUnixTimestamp,
  };
  const curve = useSoulCurve({
    heroId,
    gameMode,
    matchMode,
    minRankId,
    maxRankId,
    minUnixTimestamp,
    maxUnixTimestamp,
  });
  const stats = useQuery(itemStatsQueryOptions(filters));
  const { data: upgrades } = useQuery(itemUpgradesQueryOptions);
  // The slider's own value while the URL behind `flexMinutes` catches up in a transition: tied to the value it moved
  // from, so key presses build on each other, and dropped once the props change (to the new value, or another build).
  const flexKey = flexMinutes.join(",");
  const [flexDraft, setFlexDraft] = useState<{ from: string; minutes: number[] } | null>(null);
  const shownFlex = flexDraft?.from === flexKey ? flexDraft.minutes : [...flexMinutes];
  // Items another item is built from: their sales count the purchases merged into that upgrade as well.
  const isComponent = useMemo(() => {
    const classNames = new Set((upgrades ?? []).flatMap((item) => item.component_items ?? []));
    return new Set((upgrades ?? []).filter((item) => classNames.has(item.class_name)).map((item) => item.id));
  }, [upgrades]);
  const imageOf = useMemo(
    () =>
      new Map((upgrades ?? []).map((item) => [item.id, item.shop_image_webp ?? item.shop_image_small ?? undefined])),
    [upgrades],
  );

  const plot = useMemo(() => {
    const points = curve.points;
    if (!points) return null;
    const at = (t: number) => soulsAt(points, t);
    // The curve rises, so the time a net worth is reached is read back off it.
    const timeOf = (souls: number) => {
      const i = points.findIndex((p) => p.souls >= souls);
      if (i < 0) return null;
      if (i === 0) return 0;
      const a = points[i - 1];
      const b = points[i];
      return a.t + ((b.t - a.t) * (souls - a.souls)) / Math.max(1, b.souls - a.souls);
    };
    const byItem = new Map((stats.data ?? []).map((row) => [row.item_id, row]));
    const placed: Placed[] = [...items]
      .sort((a, b) => a.column - b.column || (a.netWorthAtBuy ?? 0) - (b.netWorthAtBuy ?? 0))
      .map((item) => {
        const row = byItem.get(item.itemId);
        const sold = row?.sold ?? null;
        const soldShare = row && sold != null && row.matches > 0 ? sold / row.matches : null;
        const avgSellAt = row && row.avg_sell_time_s > 0 ? row.avg_sell_time_s : null;
        // Bought in its stage, so it sits in its stage's stretch of the curve. The API's net worth at purchase is off
        // for purchases before the first stats snapshot (~3m: it reads the final net worth, 16k for a 0–9m Rapid
        // Rounds); such a value falls outside the stretch, and the item's average buy time places it instead.
        const from = STAGE_STARTS[item.column] ?? 0;
        const to = STAGE_STARTS[item.column + 1] ?? END_S;
        const byNetWorth = item.netWorthAtBuy != null ? timeOf(item.netWorthAtBuy) : null;
        const avgBuyAt = row && row.avg_buy_time_s > 0 ? row.avg_buy_time_s : null;
        const boughtAt =
          byNetWorth != null && byNetWorth >= from && byNetWorth <= to
            ? byNetWorth
            : Math.min(Math.max(avgBuyAt ?? (from + to) / 2, from), to);
        const netWorth = at(boughtAt);
        // Sold in the stage the build sells it in, at its buyers' average sell time if that falls in the stage.
        let soldAt: number | null = null;
        if (item.sellColumn != null) {
          const sellFrom = STAGE_STARTS[item.sellColumn] ?? END_S;
          const sellTo = STAGE_STARTS[item.sellColumn + 1] ?? END_S;
          soldAt = Math.min(Math.max(avgSellAt ?? (sellFrom + sellTo) / 2, sellFrom), sellTo);
        }
        return {
          ...item,
          netWorthAtBuy: netWorth,
          boughtAt,
          soldShare,
          avgSellAt,
          sold: soldAt != null ? { at: soldAt, souls: at(soldAt) } : null,
        };
      });
    // The build's spending over time: each purchase adds its price, each sale takes back the refund.
    const events = placed.flatMap((p) => [
      ...(p.boughtAt != null ? [{ t: p.boughtAt, delta: p.cost }] : []),
      ...(p.sold ? [{ t: p.sold.at, delta: -p.cost * SELL_REFUND }] : []),
    ]);
    const spentAt = (t: number) => events.reduce((sum, e) => (e.t <= t ? sum + e.delta : sum), 0);
    // The curve's own points, plus a point at every purchase and sale so the spending steps where it happens.
    const times = [...new Set([...points.map((p) => p.t), ...events.map((e) => Math.round(e.t)), END_S])]
      .filter((t) => t <= END_S)
      .sort((a, b) => a - b);
    const series = times.map((t) => ({ t, souls: at(t), spent: spentAt(t) }));
    return { series, placed };
  }, [curve.points, stats.data, items]);

  // What the whole build costs, against the net worth when its last item is bought.
  const last = plot?.placed.reduce<Placed | null>(
    (latest, p) => (p.boughtAt != null && (latest?.boughtAt ?? -1) < p.boughtAt ? p : latest),
    null,
  );
  const total =
    last?.boughtAt != null && last.netWorthAtBuy
      ? {
          cost: items.reduce((sum, item) => sum + item.cost, 0),
          share: items.reduce((sum, item) => sum + item.cost, 0) / last.netWorthAtBuy,
          netWorth: last.netWorthAtBuy,
          at: last.boughtAt,
        }
      : null;

  return (
    <Panel>
      <PanelHeader title={title} icon={Coins} size="sm" />
      <PanelBody className="@container">
        <div className="grid gap-4 @3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex min-w-0 flex-col gap-2">
            {curve.isPending ? (
              <ChartLoading label="soul curve" size="lg" />
            ) : curve.isError ? (
              <ChartError label="soul curve" retrying={curve.isFetching} onRetry={() => void curve.refetch()} />
            ) : !plot ? (
              <ChartEmpty label="soul curve" />
            ) : (
              <>
                <ChartSurface label="Average net worth over the game, with the build's items" variant="flush" size="lg">
                  <ComposedChart data={plot.series} margin={{ top: 20, right: 16, bottom: 0, left: 0 }}>
                    {STAGE_STARTS.map((start, i) => (
                      <ReferenceArea
                        key={start}
                        x1={start}
                        x2={STAGE_STARTS[i + 1] ?? END_S}
                        fill={CHART_COLOR.ink}
                        fillOpacity={i % 2 === 0 ? 0 : 0.04}
                        stroke="none"
                        label={{ value: STAGE_LABELS[i], position: "insideTop", offset: -16, ...CHART_TICK }}
                      />
                    ))}
                    <CartesianGrid {...CHART_GRID} />
                    {flexMinutes.map((m, i) => (
                      <ReferenceLine
                        key={i}
                        x={m * 60}
                        {...CHART_MARKER_LINE}
                        label={{ value: `+${i + 1}`, position: "insideBottomRight", ...CHART_MARKER_LABEL }}
                      />
                    ))}
                    <XAxis
                      {...CHART_X_AXIS}
                      dataKey="t"
                      type="number"
                      domain={[0, END_S]}
                      ticks={TICKS}
                      tickFormatter={(s: number) => `${s / 60}m`}
                    />
                    {/* 40px, the flex slider's inset below, so the two share the plot's span. */}
                    <YAxis {...CHART_Y_AXIS} width={Y_AXIS_WIDTH} tickFormatter={compact} />
                    <Line
                      dataKey="souls"
                      type="monotone"
                      stroke={CHART_COLOR.share}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      dataKey="spent"
                      type="stepAfter"
                      stroke={CHART_COLOR.ink}
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                    {plot.placed.flatMap((p) => {
                      const href = imageOf.get(p.itemId);
                      const marks = [];
                      if (p.boughtAt != null && p.netWorthAtBuy != null && p.boughtAt <= END_S) {
                        marks.push(
                          <ReferenceDot
                            key={`${p.key}-buy`}
                            x={p.boughtAt}
                            y={p.netWorthAtBuy}
                            shape={({ cx, cy }: { cx?: number; cy?: number }) => (
                              <ItemMark href={href} cx={cx ?? 0} cy={cy ?? 0} />
                            )}
                          />,
                        );
                      }
                      if (p.sold) {
                        marks.push(
                          <ReferenceDot
                            key={`${p.key}-sell`}
                            x={p.sold.at}
                            y={p.sold.souls}
                            shape={({ cx, cy }: { cx?: number; cy?: number }) => (
                              <ItemMark href={href} cx={cx ?? 0} cy={cy ?? 0} sold />
                            )}
                          />,
                        );
                      }
                      return marks;
                    })}
                  </ComposedChart>
                </ChartSurface>
                {/* Under the timeline it sets: when the three flex slots open, marked on the plot above. */}
                {/* The track spans the plot exactly (a fixed y-axis width on its left, the plot margin on its right), so a
                    thumb sits on its minute and on its marker line. */}
                <div className="flex flex-col gap-1 ps-10 pe-4">
                  <Slider
                    min={0}
                    max={END_S / 60}
                    step={1}
                    minStepsBetweenThumbs={0}
                    value={shownFlex}
                    onValueChange={(next) => {
                      setFlexDraft({ from: flexKey, minutes: next });
                      onFlexMinutesChange(next);
                    }}
                    thumbLabels={["First flex slot", "Second flex slot", "Third flex slot"]}
                    getValueText={(m) => `${m} minutes`}
                  />
                  <span className="flex justify-between gap-2 text-xs text-muted-foreground tabular-nums">
                    <span>Flex slots</span>
                    <span className="text-foreground">{shownFlex.map((m) => `${m}m`).join(" · ")}</span>
                  </span>
                </div>
                <ChartLegend className="justify-center">
                  <ChartLegendItem color={CHART_COLOR.share} shape="line">
                    Average net worth
                  </ChartLegendItem>
                  <ChartLegendItem color={CHART_COLOR.ink} shape="dashed">
                    Build spending
                  </ChartLegendItem>
                  <ChartLegendItem color={CHART_COLOR.ink} shape="ring">
                    Bought
                  </ChartLegendItem>
                  <ChartLegendItem color={CHART_COLOR.negative} shape="ring">
                    Sold
                  </ChartLegendItem>
                </ChartLegend>
              </>
            )}
          </div>
          <RankedEntityList density="compact" columns="single" aria-label="Build items by net worth">
            {(plot?.placed ?? []).map((p, index) => (
              <RankedEntityRow
                key={p.key}
                rank={index + 1}
                entity={{ itemId: p.itemId }}
                meta={`${p.cost.toLocaleString("en-US")} souls`}
              >
                <RankedEntityMetric label="Souls" value={p.netWorthAtBuy != null ? compact(p.netWorthAtBuy) : null} />
                <RankedEntityMetric label="Bought" value={p.boughtAt != null ? clock(p.boughtAt) : null} />
                <RankedEntityMetric
                  // A share of purchases where the API reports sales, else the average time of a sale.
                  label={isComponent.has(p.itemId) ? "Replaced" : p.soldShare != null ? "Sold" : "Sold at"}
                  value={
                    p.soldShare != null
                      ? `${Math.round(p.soldShare * 100)}%`
                      : p.avgSellAt != null
                        ? clock(p.avgSellAt)
                        : null
                  }
                />
              </RankedEntityRow>
            ))}
          </RankedEntityList>
        </div>
      </PanelBody>
      {total && (
        <PanelFooter>
          {total.cost.toLocaleString("en-US")} souls in all: {Math.round(total.share * 100)}% of the{" "}
          {compact(total.netWorth)} net worth at {clock(total.at)}
        </PanelFooter>
      )}
    </Panel>
  );
}

/** An item's icon on the plot, framed in ink; a sold one is framed in the loss color and faded. */
function ItemMark({
  href,
  cx,
  cy,
  sold = false,
}: {
  href: string | undefined;
  cx: number;
  cy: number;
  sold?: boolean;
}) {
  const size = 20;
  return (
    <g>
      <rect
        x={cx - size / 2 - 2}
        y={cy - size / 2 - 2}
        width={size + 4}
        height={size + 4}
        rx={5}
        fill={CHART_COLOR.surface}
        stroke={sold ? CHART_COLOR.negative : CHART_COLOR.ink}
        strokeWidth={1.5}
      />
      {href && (
        <image href={href} x={cx - size / 2} y={cy - size / 2} width={size} height={size} opacity={sold ? 0.5 : 1} />
      )}
    </g>
  );
}
