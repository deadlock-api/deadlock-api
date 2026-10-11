import { useQuery } from "@tanstack/react-query";
import { Coins } from "lucide-react";
import { useMemo } from "react";
import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, XAxis, YAxis } from "recharts";

import { RankedEntityList, RankedEntityMetric, RankedEntityRow } from "~/components/domain/assets/RankedEntityList";
import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { ChartEmpty, ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import { CHART_COLOR, CHART_GRID, CHART_TICK, CHART_X_AXIS, CHART_Y_AXIS } from "~/components/patterns/charts/theme";
import { Panel, PanelBody, PanelFooter, PanelHeader } from "~/components/patterns/panel/Panel";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";
import { playerPerformanceCurveQueryOptions } from "~/queries/player-performance-curve-query";

// Must match TIME_PHASE_BOUNDARIES on the API: the build flow's stages, in seconds.
const STAGE_STARTS = [0, 540, 1200, 1800] as const;
const STAGE_LABELS = ["0–9m", "9–20m", "20–30m", "30m+"] as const;
// The plot ends here: few games run longer, and the curve's last points come from those few.
const END_S = 2700;
const TICKS = [0, 300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700];
// An item most of its buyers sell gets a sold mark at their average sell time.
const SOLD_BY_MOST = 0.5;

export interface EconomyItem {
  key: string;
  itemId: number;
  /** The build flow stage it was picked in. */
  column: number;
  cost: number;
  /** Its buyers' average net worth when they bought it in that stage. */
  netWorthAtBuy: number | null;
}

interface BuildEconomyProps {
  title: React.ReactNode;
  items: EconomyItem[];
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
  /** Set when most buyers sell it: the sold mark's place. */
  sold: { at: number; souls: number } | null;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n)));

/**
 * The build on the hero's soul curve: the average net worth over the game, each item where the curve reaches the net
 * worth its buyers had when they bought it, and a sold mark where most buyers sell it again. Beside it each item's
 * price, that net worth and time, and how often or when it is sold.
 */
export function BuildEconomy({
  title,
  items,
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
  const curve = useQuery(playerPerformanceCurveQueryOptions({ ...filters, resolution: 0 }));
  const stats = useQuery(itemStatsQueryOptions(filters));
  const { data: upgrades } = useQuery(itemUpgradesQueryOptions);
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
    if (!curve.data || curve.data.length === 0) return null;
    const points = [
      { t: 0, souls: 0 },
      ...curve.data.map((p) => ({ t: p.game_time, souls: p.net_worth_avg })).sort((a, b) => a.t - b.t),
    ];
    const soulsAt = (t: number) => {
      const i = points.findIndex((p) => p.t >= t);
      if (i < 0) return points[points.length - 1].souls;
      if (i === 0) return points[0].souls;
      const a = points[i - 1];
      const b = points[i];
      return a.souls + ((b.souls - a.souls) * (t - a.t)) / (b.t - a.t);
    };
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
        const netWorth = soulsAt(boughtAt);
        // A component's "sales" are mostly upgrades into the next item, not sales: it gets no sold mark.
        const sells =
          !isComponent.has(item.itemId) &&
          soldShare != null &&
          soldShare >= SOLD_BY_MOST &&
          avgSellAt != null &&
          avgSellAt <= END_S;
        return {
          ...item,
          netWorthAtBuy: netWorth,
          boughtAt,
          soldShare,
          avgSellAt,
          sold: sells && avgSellAt != null ? { at: avgSellAt, souls: soulsAt(avgSellAt) } : null,
        };
      });
    const series = points.filter((p) => p.t <= END_S);
    if (series.at(-1)?.t !== END_S) series.push({ t: END_S, souls: soulsAt(END_S) });
    return { series, placed };
  }, [curve.data, stats.data, items, isComponent]);

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
              <ChartLoading label="soul curve" size="md" />
            ) : curve.isError ? (
              <ChartError label="soul curve" retrying={curve.isFetching} onRetry={() => void curve.refetch()} />
            ) : !plot ? (
              <ChartEmpty label="soul curve" />
            ) : (
              <>
                <ChartSurface label="Average net worth over the game, with the build's items" variant="flush" size="md">
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
                    <XAxis
                      {...CHART_X_AXIS}
                      dataKey="t"
                      type="number"
                      domain={[0, END_S]}
                      ticks={TICKS}
                      tickFormatter={(s: number) => `${s / 60}m`}
                    />
                    <YAxis {...CHART_Y_AXIS} tickFormatter={compact} />
                    <Line
                      dataKey="souls"
                      type="monotone"
                      stroke={CHART_COLOR.share}
                      strokeWidth={2}
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
                <ChartLegend className="justify-center">
                  <ChartLegendItem color={CHART_COLOR.share} shape="line">
                    Average net worth
                  </ChartLegendItem>
                  <ChartLegendItem color={CHART_COLOR.ink} shape="ring">
                    Bought
                  </ChartLegendItem>
                  <ChartLegendItem color={CHART_COLOR.negative} shape="ring">
                    Sold by most
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
