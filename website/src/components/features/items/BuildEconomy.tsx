import { useQuery } from "@tanstack/react-query";
import { Coins, ListOrdered } from "lucide-react";
import { useMemo, useState } from "react";
import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts";

import { AbilityImage } from "~/components/domain/assets/AbilityImage";
import { AbilityLevelMark } from "~/components/domain/assets/AbilityOrderGrid";
import { ItemCell } from "~/components/domain/assets/ItemCell";
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
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { NoValue } from "~/components/ui/no-value";
import { Slider } from "~/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
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
// A skill mark's width as a share of the plot (a 20px mark on a ~600px plot): marks of one ability step apart by it.
const SKILL_MARK_SPAN = 0.035;
// An item mark's width with its frame and a gap, in pixels: marks closer than this on the curve step up into rows
// above it, at most this many, each a mark's height higher, tied to their point by a leader line.
const ITEM_MARK_SPAN = 26;
const ITEM_MARK_ROWS = 4;
// The plot's right margin, in pixels (the chart's `margin.right`).
const PLOT_MARGIN_RIGHT = 16;
const NO_SKILLS: readonly { level: number; abilityId: number; at: number }[] = [];
const NO_ABILITIES: readonly number[] = [];
// The y-axis width in pixels: the flex slider under the plot is inset by the same (`ps-10`).
const Y_AXIS_WIDTH = 40;
const TICKS = [0, 300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700];

export interface EconomyItem {
  key: string;
  itemId: number;
  /** The build flow stage it was picked in. */
  column: number;
  /** What it adds to the build's spending: its price, less a held component's that it is built from. */
  cost: number;
  /** Its shop price. */
  price: number;
  /** Its buyers' average net worth when they bought it in that stage. */
  netWorthAtBuy: number | null;
  /** The stage the build sells it in, if it does. */
  sellColumn: number | null;
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

interface BuildEconomyOptions extends SoulCurveFilters {
  items: EconomyItem[];
}

/**
 * The build on the hero's soul curve: each item where the curve reaches the net worth its buyers had when they bought
 * it, a sold mark where the build sells it, and the build's spending over time. The souls chart and the buy order
 * list read the same answer.
 */
export function useBuildEconomy({ items, ...filters }: BuildEconomyOptions) {
  const curve = useSoulCurve(filters);
  const stats = useQuery(
    itemStatsQueryOptions({
      heroIds: filters.heroId != null ? String(filters.heroId) : undefined,
      gameMode: filters.gameMode,
      matchMode: filters.matchMode,
      minAverageBadge: filters.minRankId,
      maxAverageBadge: filters.maxRankId,
      minUnixTimestamp: filters.minUnixTimestamp,
      maxUnixTimestamp: filters.maxUnixTimestamp,
    }),
  );
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
    // In the order the build buys them, which the list beside the plot numbers.
    placed.sort((a, b) => (a.boughtAt ?? Number.POSITIVE_INFINITY) - (b.boughtAt ?? Number.POSITIVE_INFINITY));
    return { series, placed };
  }, [curve.points, stats.data, items]);

  return { curve, plot, isComponent, imageOf };
}

export type BuildEconomyData = ReturnType<typeof useBuildEconomy>;

interface BuildEconomyProps extends Omit<React.ComponentProps<typeof Panel>, "title"> {
  title: React.ReactNode;
  economy: BuildEconomyData;
  /** The skill order's upgrades and when they are taken (seconds): a lane per ability under the timeline. */
  skills?: readonly { level: number; abilityId: number; at: number }[];
  /** The hero's four abilities in slot order: the lanes' order. */
  abilities?: readonly number[];
  /** When the three flex slots unlock, in minutes; the timeline marks them and its slider moves them. */
  flexMinutes: readonly number[];
  onFlexMinutesChange: (minutes: number[]) => void;
}

/**
 * The souls chart: the hero's average net worth over the game with the build's items on it, its spending, the skill
 * upgrades by ability, and the flex slots' unlock times on a slider. The plot grows with its panel.
 */
export function BuildEconomy({
  title,
  economy,
  skills = NO_SKILLS,
  abilities = NO_ABILITIES,
  flexMinutes,
  onFlexMinutesChange,
  ...props
}: BuildEconomyProps) {
  const { curve, plot, imageOf } = economy;
  // The slider's own value while the URL behind `flexMinutes` catches up in a transition: tied to the value it moved
  // from, so key presses build on each other, and dropped once the props change (to the new value, or another build).
  const flexKey = flexMinutes.join(",");
  const [flexDraft, setFlexDraft] = useState<{ from: string; minutes: number[] } | null>(null);
  const shownFlex = flexDraft?.from === flexKey ? flexDraft.minutes : [...flexMinutes];
  const lanes = useMemo(() => skillLanes(skills, abilities), [skills, abilities]);
  // The plot's width, to step marks that would cover each other into rows above the curve.
  const [plotWidth, setPlotWidth] = useState(0);
  const plotRef = (element: HTMLDivElement | null) => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setPlotWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  };
  const rowOf = useMemo(() => {
    const rows = new Map<string, number>();
    if (!plot || plotWidth <= 0) return rows;
    const perSecond = (plotWidth - Y_AXIS_WIDTH - PLOT_MARGIN_RIGHT) / END_S;
    const rowEnds: number[] = [];
    for (const p of plot.placed) {
      if (p.boughtAt == null) continue;
      const x = p.boughtAt * perSecond;
      let row = rowEnds.findIndex((end) => x - end >= ITEM_MARK_SPAN);
      if (row < 0) {
        // Every row is taken here: a new one, or else the row that frees up first.
        row = rowEnds.length < ITEM_MARK_ROWS ? rowEnds.length : rowEnds.indexOf(Math.min(...rowEnds));
      }
      rowEnds[row] = x;
      rows.set(p.key, row);
    }
    return rows;
  }, [plot, plotWidth]);

  return (
    <Panel {...props}>
      <PanelHeader title={title} icon={Coins} size="sm" />
      <PanelBody className="@container flex flex-1 flex-col gap-2">
        {curve.isPending ? (
          <ChartLoading label="soul curve" size="lg" />
        ) : curve.isError ? (
          <ChartError label="soul curve" retrying={curve.isFetching} onRetry={() => void curve.refetch()} />
        ) : !plot ? (
          <ChartEmpty label="soul curve" />
        ) : (
          <>
            {/* At least the large plot's height, more where the panel beside it is taller. */}
            <div ref={plotRef} className="flex min-h-90 flex-1 flex-col @xl:min-h-105">
              <ChartSurface label="Average net worth over the game, with the build's items" variant="flush" size="grow">
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
                          // Keyed by its row too: the plot keeps a dot's first shape, so a new row is a new dot.
                          key={`${p.key}-buy-${rowOf.get(p.key) ?? 0}`}
                          x={p.boughtAt}
                          y={p.netWorthAtBuy}
                          shape={({ cx, cy }: { cx?: number; cy?: number }) => (
                            <ItemMark
                              href={href}
                              cx={cx ?? 0}
                              cy={cy ?? 0}
                              lift={(rowOf.get(p.key) ?? 0) * ITEM_MARK_SPAN}
                            />
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
            </div>
            {lanes.length > 0 && (
              // The skill upgrades on the plot's span, one lane per ability, its icon in the y-axis' gutter: each
              // upgrade a numbered mark at its average time. A narrow plot packs the early upgrades into one clump:
              // the lanes show from a medium width on.
              <ol aria-label="Skill upgrades by time" className="hidden flex-col gap-0.5 @md:flex">
                {lanes.map((lane) => (
                  <li key={lane.abilityId} className="flex h-5 items-center pe-4">
                    <span className="flex w-10 shrink-0 justify-center">
                      <AbilityImage abilityId={lane.abilityId} className="size-5" />
                    </span>
                    <ol className="relative h-5 flex-1">
                      {lane.marks.map((mark) => (
                        <li
                          key={mark.level}
                          className="absolute top-0 -translate-x-1/2"
                          style={{ insetInlineStart: `${mark.position * 100}%` }}
                        >
                          <AbilityLevelMark level={mark.level} abilitySlot={lane.slot} />
                          <span className="sr-only">at {gameClock(mark.at)}</span>
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ol>
            )}
            {/* The track spans the plot exactly (a fixed y-axis width on its left, the plot margin on its right), so a
                thumb sits on its minute and on its marker line. */}
            <div className="flex flex-col gap-1.5 ps-10 pe-4">
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
              {/* The slots' times and the legend on one line, under each other where they do not fit. */}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span className="flex gap-2 text-xs text-muted-foreground tabular-nums">
                  <span>Flex slots</span>
                  <span className="text-foreground">{shownFlex.map((m) => `${m}m`).join(" · ")}</span>
                </span>
                <ChartLegend>
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
              </div>
            </div>
          </>
        )}
      </PanelBody>
    </Panel>
  );
}

/**
 * The build's items in the order it buys them, a line apiece: price (and what it adds over a held component), the net
 * worth and time of the purchase, and how often its buyers sell it, or upgrade it when it is a component.
 */
export function BuildPurchases({
  economy,
  ...props
}: Omit<React.ComponentProps<typeof Panel>, "title"> & { economy: BuildEconomyData }) {
  const { plot, isComponent } = economy;
  return (
    <Panel {...props}>
      <PanelHeader title="Buy order" icon={ListOrdered} size="sm" />
      {/* The order is the purchases' places on the soul curve: nothing to list until it is in. */}
      {economy.curve.isPending ? (
        <PanelBody>
          <LoadingState label="buy order" variant="skeleton" />
        </PanelBody>
      ) : (
        <Table density="dense" className="tabular-nums" aria-label="Build items in buy order">
          <TableHeader tone="muted">
            <TableRow>
              <TableHead className="w-8 text-end">#</TableHead>
              <TableHead data-pinned>Item</TableHead>
              <TableHead className="hidden text-end @sm/table:table-cell">Price</TableHead>
              <TableHead className="hidden text-end @md/table:table-cell">Souls</TableHead>
              <TableHead className="text-end">Bought</TableHead>
              <TableHead className="text-end">Then</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(plot?.placed ?? []).map((p, index) => (
              <TableRow key={p.key}>
                <TableCell className="text-end text-muted-foreground">{index + 1}</TableCell>
                <TableCell data-pinned>
                  <ItemCell itemId={p.itemId} size="sm" className="max-w-48" />
                </TableCell>
                <TableCell className="hidden text-end @sm/table:table-cell">
                  {p.price.toLocaleString("en-US")}
                  {p.price > p.cost && (
                    <span className="text-muted-foreground"> +{p.cost.toLocaleString("en-US")}</span>
                  )}
                </TableCell>
                <TableCell className="hidden text-end @md/table:table-cell">
                  {p.netWorthAtBuy != null ? compact(p.netWorthAtBuy) : <NoValue />}
                </TableCell>
                <TableCell className="text-end">{p.boughtAt != null ? clock(p.boughtAt) : <NoValue />}</TableCell>
                <TableCell className="text-end text-muted-foreground">
                  {/* A share of purchases where the API reports sales, else the average time of a sale. */}
                  {p.soldShare != null ? (
                    `${isComponent.has(p.itemId) ? "upgraded" : "sold"} ${Math.round(p.soldShare * 100)}%`
                  ) : p.avgSellAt != null ? (
                    `sold ${clock(p.avgSellAt)}`
                  ) : (
                    <NoValue />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}

/**
 * The skill upgrades by ability, in slot order: each at its share of the plot's span. Marks of one ability closer
 * than a mark's width are pushed apart (the later one right), so a run of upgrades reads as a run of numbers.
 */
function skillLanes(
  skills: readonly { level: number; abilityId: number; at: number }[],
  abilities: readonly number[],
): { abilityId: number; slot: number; marks: { level: number; at: number; position: number }[] }[] {
  const order = [...new Set([...abilities, ...skills.map((s) => s.abilityId)])];
  return order.flatMap((abilityId, slot) => {
    const own = skills.filter((s) => s.abilityId === abilityId).sort((a, b) => a.at - b.at);
    if (own.length === 0) return [];
    let last = Number.NEGATIVE_INFINITY;
    const marks = own.map((s) => {
      const position = Math.max(Math.min(s.at, END_S) / END_S, last + SKILL_MARK_SPAN);
      last = position;
      return { level: s.level, at: s.at, position: Math.min(position, 1) };
    });
    return [{ abilityId, slot, marks }];
  });
}

/**
 * An item's icon on the plot, framed in ink; a sold one is framed in the loss color and faded. A `lift` raises it
 * above its point on the curve (below it near the plot's top), where a dot marks the point and a line ties the two.
 */
function ItemMark({
  href,
  cx,
  cy: pointY,
  sold = false,
  lift = 0,
}: {
  href: string | undefined;
  cx: number;
  cy: number;
  sold?: boolean;
  lift?: number;
}) {
  const size = 20;
  const cy = lift > 0 && pointY - lift < size ? pointY + lift : pointY - lift;
  return (
    <g>
      {lift > 0 && (
        <>
          <line x1={cx} y1={pointY} x2={cx} y2={cy} stroke={CHART_COLOR.ink} strokeWidth={1} strokeOpacity={0.6} />
          <circle cx={cx} cy={pointY} r={2.5} fill={CHART_COLOR.ink} />
        </>
      )}
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
