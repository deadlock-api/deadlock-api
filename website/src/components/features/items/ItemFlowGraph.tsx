import { useQuery } from "@tanstack/react-query";
import { Plus, Workflow } from "lucide-react";
import { parseAsArrayOf, parseAsNumberLiteral, parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ItemImage } from "~/components/domain/assets/ItemImage";
import { ItemName } from "~/components/domain/assets/ItemName";
import { GraphNodeCard } from "~/components/domain/graph/GraphNodeCard";
import { FilterBar } from "~/components/patterns/filter-bar/FilterBar";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Delta } from "~/components/ui/delta";
import { DragScroll } from "~/components/ui/drag-scroll";
import { Field } from "~/components/ui/field";
import { Heading } from "~/components/ui/heading";
import { KeyValue, KeyValueList } from "~/components/ui/key-value";
import { OptionRow } from "~/components/ui/option-row";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Separator } from "~/components/ui/separator";
import { Stack } from "~/components/ui/stack";
import { Tooltip, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { TooltipProvider } from "~/components/ui/tooltip";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import { TONE_COLOR, TONE_TEXT, toneOf } from "~/lib/tone";
import { cn } from "~/lib/utils";
import { wilsonScoreInterval } from "~/lib/wilson";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { itemFlowQueryOptions } from "~/queries/item-flow-query";

const SLOT_ACCENTS = ["weapon", "vitality", "spirit"] as const;

// Cards grow with the room there is, from a width that still fits an item name up to one that fits long names whole.
const CARD_W_MIN = 200;
const CARD_W_MAX = 260;
const CARD_H = 94;
const COL_GAP = 24;
const ROW_GAP = 10;
const HEADER_H = 48;
const TIER_H = 24;
const PICKER_H = 50;

const PHASE_INTERVAL_S = 600;
const PHASE_COUNT = 4;
// Street brawl stages are rounds rather than time phases.
const STREET_BRAWL_ROUNDS = 8;
// Confidence levels derived from the 95% Wilson CI width (half-width = ± margin shown to users).
// The same list drives the per-card icon and the legend so they never drift apart.
const CONFIDENCE_LEVELS = [
  { maxWidth: 0.06, icon: "icon-[mdi--signal-cellular-3]", color: "text-positive", label: "High", margin: "±3 pts" },
  {
    maxWidth: 0.12,
    icon: "icon-[mdi--signal-cellular-2]",
    color: "text-warning",
    label: "Medium",
    margin: "±3–6 pts",
  },
  {
    maxWidth: 0.24,
    icon: "icon-[mdi--signal-cellular-1]",
    color: "text-chart-5",
    label: "Low",
    margin: "±6–12 pts",
  },
  {
    maxWidth: Number.POSITIVE_INFINITY,
    icon: "icon-[mdi--signal-cellular-outline]",
    color: "text-negative",
    label: "Very low",
    margin: "wider than ±12 pts",
  },
] as const;

// Maps a 95% Wilson CI width to a confidence level shown as a signal-strength icon on each card.
function confidenceLevel(low: number, high: number): (typeof CONFIDENCE_LEVELS)[number] {
  const width = high - low;
  return CONFIDENCE_LEVELS.find((l) => width <= l.maxWidth) ?? CONFIDENCE_LEVELS[CONFIDENCE_LEVELS.length - 1];
}

// Minimum-confidence filter: max allowed 95% CI width per option.
const CONFIDENCE_FILTERS = {
  all: Number.POSITIVE_INFINITY,
  low: 0.24,
  medium: 0.12,
  high: 0.06,
} as const;
type ConfidenceFilter = keyof typeof CONFIDENCE_FILTERS;
const CONFIDENCE_FILTER_OPTIONS: readonly { value: ConfidenceFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "low", label: "Low+" },
  { value: "medium", label: "Med+" },
  { value: "high", label: "High" },
];

const SORT_OPTIONS = [
  { value: "pickrate", label: "Pick rate" },
  { value: "winrate", label: "Win rate" },
  { value: "winrate_adj", label: "WR (adj.)" },
] as const;
const BAR_OPTIONS = [
  { value: "adjusted", label: "Adjusted" },
  { value: "raw", label: "Raw" },
] as const;
const PER_COLUMN_OPTIONS = [4, 6, 8, 12].map((n) => ({ value: String(n), label: `Top ${n}` }));

// Must match TIME_PHASE_BOUNDARIES on the API (0-9m, 9-20m, 20-30m, 30m+).
const TIME_PHASE_LABELS = ["0–9m", "9–20m", "20–30m", "30m+"] as const;

function phaseLabel(column: number, isStreetBrawl: boolean): { title: string; sub: string } {
  if (isStreetBrawl) {
    return { title: `Round ${column + 1}`, sub: "round" };
  }
  return { title: TIME_PHASE_LABELS[column] ?? `phase ${column + 1}`, sub: "purchase time" };
}

interface ItemFlowGraphProps {
  heroId: number | null;
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  minMatches?: number | null;
  gameMode?: GameMode;
  matchMode?: MatchMode;
}

interface PlacedNode {
  key: string;
  itemId: number;
  column: number;
  x: number;
  y: number;
  wins: number;
  losses: number;
  matches: number;
  players: number;
  winRate: number;
  adjWinRate: number;
  avgNetWorth: number;
  wrLow: number;
  wrHigh: number;
  /** Adjusted win rate normalized to the stage's min/max range (for the bar fill only). */
  wrBar: number;
  /** Raw win rate normalized to the stage's min/max range (for the bar fill only). */
  wrBarRaw: number;
  pickRate: number;
  /** Pick rate normalized to the most-picked item in the same stage (for the bar fill only). */
  pickBar: number;
  chainPickRate: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  locked: boolean;
}

interface Candidate {
  id: number;
  winRate: number;
  pickRate: number;
}

interface ColumnMeta {
  column: number;
  x: number;
  candidates: Candidate[];
  /** Item tiers present in this stage's data (for the per-stage tier filter buttons). */
  availableTiers: number[];
}

/** Parse the `flow_xtiers` param ("0.2,1.34" → col 0 hides tier 2; col 1 hides tiers 3,4). */
function parseExcludedTiers(raw: string): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>();
  for (const entry of raw.split(",").filter(Boolean)) {
    const [col, digits] = entry.split(".");
    if (col == null || !digits) continue;
    map.set(Number(col), new Set(digits.split("").map(Number)));
  }
  return map;
}

function serializeExcludedTiers(map: Map<number, Set<number>>): string {
  return [...map.entries()]
    .filter(([, set]) => set.size > 0)
    .map(([col, set]) => `${col}.${[...set].sort((a, b) => a - b).join("")}`)
    .join(",");
}

function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const StageLockPicker = memo(function StageLockPicker({
  candidates,
  column,
  stage,
  onLock,
}: {
  candidates: Candidate[];
  column: number;
  /** The stage's name, so each column's button says which stage it locks ("Lock item, 0–9m"). */
  stage: string;
  onLock: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="xs" className="w-full text-muted-foreground" aria-label={`Lock item, ${stage}`}>
          <Plus />
          Lock item
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="max-h-80 w-64 overflow-y-auto p-1">
        {candidates.length === 0 ? (
          <div className="p-2 text-xs text-muted-foreground">No more items in this phase.</div>
        ) : (
          candidates.map((c) => (
            <OptionRow
              key={c.id}
              selected={false}
              onClick={() => {
                onLock(`${column}:${c.id}`);
                setOpen(false);
              }}
              className="text-xs"
              leading={<ItemImage itemId={c.id} className="size-5 shrink-0" />}
              trailing={
                <>
                  <span className={cn("w-9 text-end text-3xs tabular-nums", TONE_TEXT[toneOf(c.winRate, 0.5)])}>
                    {(c.winRate * 100).toFixed(1)}%
                  </span>
                  <span className="w-9 text-end text-3xs text-chart-4 tabular-nums">
                    {(c.pickRate * 100).toFixed(1)}%
                  </span>
                </>
              }
            >
              <ItemName itemId={c.id} />
            </OptionRow>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
});

const ItemFlowCard = memo(function ItemFlowCard({
  node,
  width,
  meta,
  dimmed,
  showRaw,
  isStreetBrawl,
  onHover,
  onLock,
}: {
  node: PlacedNode;
  width: number;
  meta?: { slot?: string; cost: number; tier: number };
  dimmed: boolean;
  showRaw: boolean;
  isStreetBrawl: boolean;
  onHover: (key: string | null) => void;
  onLock: (key: string) => void;
}) {
  const accent = SLOT_ACCENTS.find((slot) => slot === meta?.slot) ?? "none";
  const tier = meta?.tier ?? 0;
  const cost = meta?.cost ?? 0;
  // Headline win rate: adjusted by default, raw if toggled (always raw for brawl).
  const displayWr = showRaw ? node.winRate : node.adjWinRate;
  const wrBar = showRaw ? node.wrBarRaw : node.wrBar;
  const conf = confidenceLevel(node.wrLow, node.wrHigh);
  return (
    <Tooltip
      content={
        <>
          <TooltipHeader title={<ItemName itemId={node.itemId} />} />
          <TooltipStats>
            {isStreetBrawl ? (
              <TooltipStat
                label="Win Rate"
                value={`${(node.winRate * 100).toFixed(1)}%`}
                className={TONE_TEXT[toneOf(node.winRate, 0.5)]}
              />
            ) : (
              <>
                <TooltipStat
                  label="Win Rate (adj.)"
                  value={`${(node.adjWinRate * 100).toFixed(1)}%`}
                  className={TONE_TEXT[toneOf(node.adjWinRate, 0.5)]}
                />
                <TooltipStat label="Raw win rate" value={`${(node.winRate * 100).toFixed(1)}%`} />
              </>
            )}
            <TooltipStat
              label="95% CI (raw)"
              value={`${(node.wrLow * 100).toFixed(1)}–${(node.wrHigh * 100).toFixed(1)}%`}
            />
            {!isStreetBrawl && (
              <TooltipStat label="Avg net worth at buy" value={Math.round(node.avgNetWorth).toLocaleString("en-US")} />
            )}
            <TooltipStat
              label="Pick Rate (phase)"
              value={`${(node.pickRate * 100).toFixed(1)}%`}
              className="text-chart-4"
            />
            <TooltipStat
              label="Chained Pick Rate"
              value={`${(node.chainPickRate * 100).toFixed(1)}%`}
              className="text-chart-4/70"
            />
            <TooltipStat label="Matches" value={node.matches.toLocaleString("en-US")} />
            <TooltipStat label="Players" value={node.players.toLocaleString("en-US")} />
            <TooltipStat
              label="W / L"
              value={
                <>
                  <span className="text-positive">{node.wins.toLocaleString("en-US")}</span>
                  {" / "}
                  <span className="text-negative">{node.losses.toLocaleString("en-US")}</span>
                </>
              }
            />
            <TooltipStat
              label="Avg KDA"
              value={`${node.avgKills.toFixed(1)} / ${node.avgDeaths.toFixed(1)} / ${node.avgAssists.toFixed(1)}`}
            />
          </TooltipStats>
          <Separator />
          <div className="text-3xs text-muted-foreground">
            {node.locked ? "Click to remove from build path" : "Click to lock into build path"}
          </div>
        </>
      }
    >
      <GraphNodeCard
        className="absolute"
        style={{ left: node.x, top: node.y, width, height: CARD_H }}
        accent={accent}
        selected={node.locked}
        dimmed={dimmed}
        onMouseEnter={() => onHover(node.key)}
        onMouseLeave={() => onHover(null)}
        interaction="pressable"
        onClick={() => onLock(node.key)}
        status={
          <span
            className={cn(conf.icon, "size-3.5", conf.color)}
            title={`Confidence: ${conf.label} (${node.matches.toLocaleString("en-US")} matches, 95% CI ${(node.wrLow * 100).toFixed(1)}–${(node.wrHigh * 100).toFixed(1)}%)`}
          />
        }
        media={<ItemImage itemId={node.itemId} className="size-9 shrink-0" />}
        name={<ItemName itemId={node.itemId} />}
        meta={
          <>
            {tier > 0 && (
              <Badge variant="muted" size="sm">
                T{tier}
              </Badge>
            )}
            {cost > 0 && <span className="tabular-nums">{cost.toLocaleString("en-US")}</span>}
          </>
        }
        winRate={displayWr}
        winRateFill={wrBar}
        pickRate={node.pickRate}
        pickRateFill={node.pickBar}
      />
    </Tooltip>
  );
});

export function ItemFlowGraph({
  heroId,
  minRankId,
  maxRankId,
  minDate,
  maxDate,
  minMatches,
  gameMode,
  matchMode,
}: ItemFlowGraphProps) {
  // View controls persisted in the URL (shareable), prefixed `flow_` to avoid clashing with
  // the page's other filters.
  // Only the offered sizes: `flow_top=-2` sliced the last two items off each stage, `0` showed none.
  const [perColumn, setPerColumn] = useQueryState(
    "flow_top",
    parseAsNumberLiteral([4, 6, 8, 12] as const).withDefault(6),
  );
  const [sortBy, setSortBy] = useQueryState(
    "flow_sort",
    parseAsStringLiteral(["pickrate", "winrate", "winrate_adj"] as const).withDefault("pickrate"),
  );
  const [wrMode, setWrMode] = useQueryState(
    "flow_bars",
    parseAsStringLiteral(["adjusted", "raw"] as const).withDefault("adjusted"),
  );
  const [minConfidence, setMinConfidence] = useQueryState(
    "flow_conf",
    parseAsStringLiteral(["all", "low", "medium", "high"] as const).withDefault("all"),
  );
  // Per-stage excluded item tiers, encoded compactly in the URL.
  const [xTiersRaw, setXTiersRaw] = useQueryState("flow_xtiers", parseAsString.withDefault(""));
  const excludedTiers = useMemo(() => parseExcludedTiers(xTiersRaw), [xTiersRaw]);
  const toggleTier = useCallback(
    (column: number, tier: number) => {
      const next = new Map([...excludedTiers].map(([c, s]) => [c, new Set(s)]));
      const set = next.get(column) ?? new Set<number>();
      if (set.has(tier)) set.delete(tier);
      else set.add(tier);
      next.set(column, set);
      setXTiersRaw(serializeExcludedTiers(next) || null);
    },
    [excludedTiers, setXTiersRaw],
  );
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  // Locks are scoped to a stage, keyed by `${column}:${itemId}`. Persisted in the URL so a
  // build path can be shared via link.
  const [storedLocked, setLocked] = useQueryState("build_path", parseAsArrayOf(parseAsString).withDefault([]));

  const isStreetBrawl = gameMode === "street_brawl";
  // Street Brawl has no adjusted win rate to show or pick; a kept `flow_sort=winrate_adj` ordered its cards by it.
  const cardSort = isStreetBrawl && sortBy === "winrate_adj" ? "pickrate" : sortBy;
  const columnCount = isStreetBrawl ? STREET_BRAWL_ROUNDS : PHASE_COUNT;
  // A lock from the other mode's stages (Street Brawl round 7 in a four-phase normal graph) padded the graph with
  // empty columns and sent the API a column it does not have; only locks this mode can hold apply.
  const locked = useMemo(
    () => storedLocked.filter((key) => Number(key.split(":")[0]) < columnCount),
    [storedLocked, columnCount],
  );

  const [wrapperRef, containerWidth] = useContainerWidth();
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);

  const lockedSet = useMemo(() => new Set(locked), [locked]);
  const lockedColumns = useMemo(() => new Set(locked.map((key) => Number(key.split(":")[0]))), [locked]);
  // The API filters by (item, stage column), paired positionally.
  const { lockedItemIds, lockedItemColumns } = useMemo(() => {
    const ids: number[] = [];
    const cols: number[] = [];
    for (const key of locked) {
      const [col, id] = key.split(":").map(Number);
      ids.push(id);
      cols.push(col);
    }
    return { lockedItemIds: ids, lockedItemColumns: cols };
  }, [locked]);

  const { data, isLoading, isFetching, isError, refetch } = useQuery(
    itemFlowQueryOptions({
      heroIds: heroId != null ? String(heroId) : undefined,
      gameMode,
      matchMode,
      minAverageBadge: minRankId,
      maxAverageBadge: maxRankId,
      minUnixTimestamp: minUnixTimestamp ?? 0,
      maxUnixTimestamp,
      minMatches: minMatches ?? undefined,
      phaseIntervalS: PHASE_INTERVAL_S,
      phaseCount: columnCount,
      lockedItemIds,
      lockedColumns: lockedItemColumns,
    }),
  );

  const { data: upgrades } = useQuery(itemUpgradesQueryOptions);
  const itemMeta = useMemo(() => {
    const map = new Map<number, { slot?: string; cost: number; tier: number }>();
    if (upgrades) {
      for (const item of upgrades) {
        map.set(item.id, { slot: item.item_slot_type ?? undefined, cost: item.cost ?? 0, tier: item.item_tier ?? 0 });
      }
    }
    return map;
  }, [upgrades]);

  const toggleLock = useCallback(
    (key: string) => {
      setLocked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    },
    [setLocked],
  );

  const layout = useMemo(() => {
    if (!data) return null;

    const popMatches = data.summary.matches || 1;
    const baseMatches = data.baseline.matches || 1;

    const byColumn = new Map<number, typeof data.nodes>();
    for (const node of data.nodes) {
      const list = byColumn.get(node.column) ?? [];
      list.push(node);
      byColumn.set(node.column, list);
    }

    // Ensure all columns from 0 to max(columns) are represented, so locked items in early stages
    // don't disappear when locking items in later stages. The API may omit earlier stages when
    // you have locks, but we still need to display them.
    const allColumnIndices = new Set([...byColumn.keys(), ...lockedColumns]);
    if (allColumnIndices.size > 0) {
      const maxCol = Math.max(...allColumnIndices);
      for (let i = 0; i <= maxCol; i++) {
        if (!byColumn.has(i)) {
          byColumn.set(i, []);
        }
      }
    }

    const columns = [...byColumn.keys()].sort((a, b) => a - b);
    if (columns.length === 0) return null;

    const W = containerWidth || 1000;
    const n = columns.length;
    const cardWidth = Math.min(CARD_W_MAX, Math.max(CARD_W_MIN, (W - COL_GAP * (n - 1)) / n));
    const colSpacing = n > 1 ? Math.max(cardWidth + COL_GAP, (W - cardWidth) / (n - 1)) : 0;
    const graphWidth = n > 1 ? colSpacing * (n - 1) + cardWidth : cardWidth;

    type Node = (typeof data.nodes)[number];
    const rawWr = (n: Node) => (n.matches > 0 ? n.wins / n.matches : 0);
    const tierOf = (n: Node) => itemMeta.get(n.item_id)?.tier ?? 0;

    // Item tiers present per stage (for the tier-filter buttons), and whether any stage needs them.
    const tiersByColumn = new Map<number, number[]>();
    for (const column of columns) {
      const ts = [...new Set((byColumn.get(column) ?? []).map(tierOf).filter((t) => t >= 1))].sort((a, b) => a - b);
      tiersByColumn.set(column, ts);
    }
    const anyTierFilter = [...tiersByColumn.values()].some((ts) => ts.length > 1);

    // Header reserves room for the title/sub, optional tier-filter row, and the lock picker.
    const headerH = HEADER_H + (anyTierFilter ? TIER_H : 0) + PICKER_H;

    const placed = new Map<string, PlacedNode>();
    const columnMeta: ColumnMeta[] = [];
    let maxRows = 0;
    const cmp =
      cardSort === "winrate"
        ? (a: Node, b: Node) => rawWr(b) - rawWr(a)
        : cardSort === "winrate_adj"
          ? (a: Node, b: Node) => b.adjusted_win_rate - a.adjusted_win_rate
          : (a: Node, b: Node) => b.matches - a.matches;
    // Drop items whose 95% CI is wider than the selected confidence threshold (locked items stay).
    const maxCiWidth = CONFIDENCE_FILTERS[minConfidence];
    const ciOk = (n: Node) => {
      const [lo, hi] = wilsonScoreInterval(n.wins, n.matches);
      return hi - lo <= maxCiWidth;
    };
    columns.forEach((column, colIndex) => {
      const excl = excludedTiers.get(column);
      const columnData = byColumn.get(column) ?? [];

      // Identify locked items in this column.
      const lockedItemsInColumn = [...lockedSet]
        .filter((k) => Number(k.split(":")[0]) === column)
        .map((k) => Number(k.split(":")[1]));
      const lockedItemSet = new Set(lockedItemsInColumn);

      const sorted = columnData
        .slice()
        .filter((n) => {
          if (lockedItemSet.has(n.item_id)) return true;
          return ciOk(n) && !(excl?.has(tierOf(n)) ?? false);
        })
        .sort(cmp);

      // Locked items always pinned to the top (in sorted order); top-N of the rest below them.
      const lockedNodes = sorted.filter((n) => lockedItemSet.has(n.item_id));

      // Ensure locked items are shown even if API didn't return them (e.g., when adding new locks).
      // Find any locked item IDs that aren't already in lockedNodes.
      const foundLockedIds = new Set(lockedNodes.map((n) => n.item_id));
      for (const itemId of lockedItemsInColumn) {
        if (!foundLockedIds.has(itemId)) {
          // Try to find this item in the full data; if not found, it won't be displayed
          // but this preserves the locked state for when the API returns updated data.
          const found = data.nodes.find((n) => n.column === column && n.item_id === itemId);
          if (found) {
            lockedNodes.push(found);
          }
        }
      }

      const rest = sorted.filter((n) => !lockedItemSet.has(n.item_id)).slice(0, perColumn);
      const list = [...lockedNodes, ...rest];
      maxRows = Math.max(maxRows, list.length);
      const x = colIndex * colSpacing;
      const denom = lockedColumns.has(column) ? baseMatches : popMatches;
      // Per-stage normalization ranges so the bars use the full width within a stage.
      const colMaxMatches = Math.max(1, ...list.map((n) => n.matches));
      const adjWrs = list.map((n) => n.adjusted_win_rate);
      const adjMin = Math.min(...adjWrs);
      const adjMax = Math.max(...adjWrs);
      const rawWrs = list.map(rawWr);
      const rawMin = Math.min(...rawWrs);
      const rawMax = Math.max(...rawWrs);
      list.forEach((node, rowIndex) => {
        const key = `${column}:${node.item_id}`;
        placed.set(key, {
          key,
          itemId: node.item_id,
          column,
          x,
          y: headerH + rowIndex * (CARD_H + ROW_GAP),
          wins: node.wins,
          losses: node.losses,
          matches: node.matches,
          players: node.players,
          winRate: node.matches > 0 ? node.wins / node.matches : 0,
          adjWinRate: node.adjusted_win_rate,
          avgNetWorth: node.avg_net_worth_at_buy,
          wrLow: wilsonScoreInterval(node.wins, node.matches)[0],
          wrHigh: wilsonScoreInterval(node.wins, node.matches)[1],
          wrBar: adjMax > adjMin ? (node.adjusted_win_rate - adjMin) / (adjMax - adjMin) : 1,
          wrBarRaw: rawMax > rawMin ? (rawWr(node) - rawMin) / (rawMax - rawMin) : 1,
          // A locked stage's population is conditioned on its own items, which makes
          // intra-stage pick rates trivially ~100%; show those vs the baseline instead.
          pickRate: node.matches / denom,
          pickBar: node.matches / colMaxMatches,
          chainPickRate: node.matches / baseMatches,
          avgKills: node.matches > 0 ? node.total_kills / node.matches : 0,
          avgDeaths: node.matches > 0 ? node.total_deaths / node.matches : 0,
          avgAssists: node.matches > 0 ? node.total_assists / node.matches : 0,
          locked: lockedSet.has(key),
        });
      });
      // The picker lists every item in the stage (incl. low-confidence) so any can be locked.
      const candidates: Candidate[] = (byColumn.get(column) ?? [])
        .slice()
        .sort((a, b) => b.matches - a.matches)
        .filter((n) => !lockedSet.has(`${column}:${n.item_id}`))
        .map((n) => ({
          id: n.item_id,
          winRate: n.adjusted_win_rate,
          pickRate: n.matches / denom,
        }));
      columnMeta.push({ column, x, candidates, availableTiers: tiersByColumn.get(column) ?? [] });
    });
    const maxBottom = headerH + maxRows * (CARD_H + ROW_GAP);

    // Scaled to the edges that are drawn: one hidden by a top-N, tier or confidence filter shrank every visible one.
    const maxEdge = Math.max(
      1,
      ...data.edges
        .filter(
          (e) => placed.has(`${e.from_column}:${e.from_item_id}`) && placed.has(`${e.from_column + 1}:${e.to_item_id}`),
        )
        .map((e) => e.matches),
    );
    const edges = data.edges
      .map((e) => {
        const from = placed.get(`${e.from_column}:${e.from_item_id}`);
        const to = placed.get(`${e.from_column + 1}:${e.to_item_id}`);
        if (!from || !to) return null;
        // When a stage has locks, only show edges leaving the locked items of that stage.
        if (lockedColumns.has(e.from_column) && !lockedSet.has(from.key)) return null;
        return {
          id: `${e.from_column}:${e.from_item_id}->${e.to_item_id}`,
          fromKey: from.key,
          toKey: to.key,
          x1: from.x + cardWidth,
          y1: from.y + CARD_H / 2,
          x2: to.x,
          y2: to.y + CARD_H / 2,
          width: 1.5 + (e.matches / maxEdge) * 6,
          winRate: e.matches > 0 ? e.wins / e.matches : 0,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e != null)
      .sort((a, b) => a.width - b.width);

    return {
      columns,
      colSpacing,
      cardWidth,
      placed: [...placed.values()],
      columnMeta,
      edges,
      width: graphWidth,
      height: maxBottom,
    };
  }, [data, perColumn, cardSort, minConfidence, excludedTiers, itemMeta, containerWidth, lockedSet, lockedColumns]);

  const highlight = useMemo(() => {
    if (!hoveredKey || !layout) return null;
    const nodes = new Set<string>([hoveredKey]);
    const edges = new Set<string>();
    for (const e of layout.edges) {
      if (e.fromKey === hoveredKey || e.toKey === hoveredKey) {
        edges.add(e.id);
        nodes.add(e.fromKey);
        nodes.add(e.toKey);
      }
    }
    return { nodes, edges };
  }, [hoveredKey, layout]);

  const pathStats = useMemo(() => {
    if (!data) return null;
    const s = data.summary;
    const b = data.baseline;
    const totalCost = locked.reduce((sum, key) => sum + (itemMeta.get(Number(key.split(":")[1]))?.cost ?? 0), 0);
    const [wrLow, wrHigh] = wilsonScoreInterval(s.wins, s.matches);
    return {
      matches: s.matches,
      players: s.players,
      wins: s.wins,
      losses: s.losses,
      winRate: s.matches > 0 ? s.wins / s.matches : 0,
      wrLow,
      wrHigh,
      baseWinRate: b.matches > 0 ? b.wins / b.matches : 0,
      pathFrequency: b.matches > 0 ? s.matches / b.matches : 0,
      avgKills: s.matches > 0 ? s.total_kills / s.matches : 0,
      avgDeaths: s.matches > 0 ? s.total_deaths / s.matches : 0,
      avgAssists: s.matches > 0 ? s.total_assists / s.matches : 0,
      kdaRatio: (s.total_kills + s.total_assists) / Math.max(1, s.total_deaths),
      avgNetWorth: s.avg_net_worth,
      avgDurationS: s.avg_duration_s,
      totalCost,
    };
  }, [data, locked, itemMeta]);

  return (
    <Stack gap={4}>
      <FilterBar variant="toolbar" title="Build flow" icon={Workflow} aria-label="Build flow controls">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
              <span className="icon-[mdi--signal-cellular-2] size-4" />
              Confidence
              <span className="icon-[mdi--information-outline] size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="flex w-72 flex-col gap-2 text-xs">
            <div className="font-semibold">How reliable is a win rate?</div>
            <p className="text-muted-foreground">
              The icon on each card shows how trustworthy its win rate is, based on the 95% confidence interval (mostly
              driven by how many matches it has). More bars = more certain.
            </p>
            <ul className="flex flex-col gap-1.5">
              {CONFIDENCE_LEVELS.map((l) => (
                <li key={l.label} className="flex items-center gap-2">
                  <span className={cn(l.icon, "size-4 shrink-0", l.color)} />
                  <span className="w-16 shrink-0 font-medium">{l.label}</span>
                  <span className="text-muted-foreground">{l.margin}</span>
                </li>
              ))}
            </ul>
            <p className="text-2xs text-muted-foreground">
              {isStreetBrawl
                ? "Win rate reflects players who bought the item, not its causal effect."
                : "Win rates are adjusted for net worth at purchase (so they're not just “rich players win”), but remain observational, not a controlled causal estimate."}
            </p>
          </PopoverContent>
        </Popover>
        <Field label="Min confidence" orientation="horizontal">
          <Segmented value={minConfidence} onValueChange={setMinConfidence} width="hug">
            {CONFIDENCE_FILTER_OPTIONS.map((option) => (
              <SegmentedItem key={option.value} value={option.value}>
                {option.label}
              </SegmentedItem>
            ))}
          </Segmented>
        </Field>
        <Field label="Sort" orientation="horizontal">
          <Segmented value={sortBy} onValueChange={setSortBy} width="hug">
            {(isStreetBrawl ? SORT_OPTIONS.filter((o) => o.value !== "winrate_adj") : SORT_OPTIONS).map((option) => (
              <SegmentedItem key={option.value} value={option.value}>
                {option.label}
              </SegmentedItem>
            ))}
          </Segmented>
        </Field>
        {!isStreetBrawl && (
          <Field label="Bars" orientation="horizontal">
            <Segmented value={wrMode} onValueChange={setWrMode} width="hug">
              {BAR_OPTIONS.map((option) => (
                <SegmentedItem key={option.value} value={option.value}>
                  {option.label}
                </SegmentedItem>
              ))}
            </Segmented>
          </Field>
        )}
        <Segmented
          aria-label="Items per stage"
          value={String(perColumn)}
          onValueChange={(v) => setPerColumn(Number(v) as 4 | 6 | 8 | 12)}
          width="hug"
        >
          {PER_COLUMN_OPTIONS.map((option) => (
            <SegmentedItem key={option.value} value={option.value}>
              {option.label}
            </SegmentedItem>
          ))}
        </Segmented>
      </FilterBar>

      {/* The summary sits beside the graph only when the graph still has room for four stages next to it. */}
      <div className="@container">
        <div className="flex flex-col gap-4 @6xl:flex-row">
          <div className="min-w-0 flex-1" ref={wrapperRef}>
            {isLoading ? (
              <LoadingState label="item flow" align="center" />
            ) : isError && !data ? (
              <ErrorState title="The build flow did not load" retrying={isFetching} onRetry={() => void refetch()} />
            ) : !layout ? (
              <EmptyState
                variant="inline"
                title={`No item flow data available for the selected filters${locked.length > 0 ? " and build path" : ""}.`}
              />
            ) : (
              <div className="relative">
                {isFetching && (
                  <LoadingState
                    label="item flow"
                    className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center pt-24"
                  />
                )}
                <DragScroll className="pb-4">
                  <div className="relative" style={{ width: layout.width, height: layout.height }}>
                    {/* Column headers: phase + reached% + lock picker */}
                    {layout.columnMeta.map((meta) => {
                      const { title, sub } = phaseLabel(meta.column, isStreetBrawl);
                      const reached = data
                        ? (data.reached_per_column[meta.column] ?? 0) / (data.baseline.matches || 1)
                        : 1;
                      return (
                        <Stack
                          key={meta.column}
                          gap={1.5}
                          className="absolute"
                          style={{ left: meta.x, top: 0, width: layout.cardWidth }}
                        >
                          <div>
                            <Heading as="h3" size="sm" className="text-center">
                              {title}
                            </Heading>
                            <div className="text-center text-3xs text-muted-foreground">{sub}</div>
                            <div
                              className={cn(
                                "text-center text-3xs",
                                reached < 0.8 ? "text-warning" : "text-muted-foreground",
                              )}
                              title="Share of games that reached this stage (lower = more survivorship-selected, e.g. long games only)"
                            >
                              {(reached * 100).toFixed(0)}% of games reached
                            </div>
                          </div>
                          {meta.availableTiers.length > 1 && (
                            <div className="flex justify-center gap-0.5">
                              {meta.availableTiers.map((t) => {
                                const off = excludedTiers.get(meta.column)?.has(t) ?? false;
                                return (
                                  <Button
                                    key={t}
                                    variant={off ? "subtle" : "soft"}
                                    size="xs"
                                    aria-pressed={!off}
                                    onClick={() => toggleTier(meta.column, t)}
                                    title={`${off ? "Show" : "Hide"} tier ${t} items in this stage`}
                                    aria-label={`T${t}, tier ${t} items at ${title}`}
                                  >
                                    T{t}
                                  </Button>
                                );
                              })}
                            </div>
                          )}
                          <StageLockPicker
                            candidates={meta.candidates}
                            column={meta.column}
                            stage={title}
                            onLock={toggleLock}
                          />
                        </Stack>
                      );
                    })}

                    {/* Links */}
                    <svg
                      className="pointer-events-none absolute inset-0"
                      width={layout.width}
                      height={layout.height}
                      aria-hidden="true"
                    >
                      {layout.edges.map((e) => {
                        const mx = (e.x1 + e.x2) / 2;
                        const active = !isFetching && (!highlight || highlight.edges.has(e.id));
                        return (
                          <path
                            key={e.id}
                            d={`M ${e.x1} ${e.y1} C ${mx} ${e.y1}, ${mx} ${e.y2}, ${e.x2} ${e.y2}`}
                            fill="none"
                            stroke={TONE_COLOR[e.winRate >= 0.5 ? "positive" : "negative"]}
                            strokeWidth={e.width}
                            strokeOpacity={active ? (highlight ? 0.65 : 0.22) : 0.05}
                          />
                        );
                      })}
                    </svg>

                    {/* Nodes */}
                    <TooltipProvider delayDuration={150}>
                      {layout.placed.map((node) => (
                        <ItemFlowCard
                          key={node.key}
                          node={node}
                          width={layout.cardWidth}
                          meta={itemMeta.get(node.itemId)}
                          dimmed={isFetching || (highlight != null && !highlight.nodes.has(node.key))}
                          showRaw={wrMode === "raw" || isStreetBrawl}
                          isStreetBrawl={isStreetBrawl}
                          onHover={setHoveredKey}
                          onLock={toggleLock}
                        />
                      ))}
                    </TooltipProvider>
                  </div>
                </DragScroll>
              </div>
            )}
          </div>

          <aside className="w-full shrink-0 self-start @6xl:w-64">
            <Panel>
              <PanelHeader title="Build Path Summary" size="sm">
                {locked.length > 0 && (
                  <Button variant="ghost" size="xs" onClick={() => setLocked([])}>
                    Clear
                  </Button>
                )}
              </PanelHeader>
              <PanelBody>
                {!pathStats && isError ? (
                  <ErrorState variant="inline" title="The build path did not load" onRetry={() => void refetch()} />
                ) : !pathStats ? (
                  <LoadingState size="sm" text="Loading build path…" label="build path" />
                ) : (
                  <Stack gap={3} className="text-xs">
                    <div className="flex items-end justify-between">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        Win Rate
                        {(() => {
                          const c = confidenceLevel(pathStats.wrLow, pathStats.wrHigh);
                          return (
                            <span
                              className={cn(c.icon, "size-4", c.color)}
                              title={`Confidence: ${c.label} (${pathStats.matches.toLocaleString("en-US")} matches)`}
                            />
                          );
                        })()}
                      </div>
                      <div className="text-end">
                        <span
                          className={cn(
                            "text-lg font-bold tabular-nums",
                            // Compare the printed tenth of a percent, so 49.99% shows as an even 50.0%, not a red one.
                            TONE_TEXT[toneOf(Math.round(pathStats.winRate * 1000), 500)],
                          )}
                        >
                          {(pathStats.winRate * 100).toFixed(1)}%
                        </span>
                        <div className="text-3xs text-muted-foreground tabular-nums">
                          95% CI {(pathStats.wrLow * 100).toFixed(1)}–{(pathStats.wrHigh * 100).toFixed(1)}%
                        </div>
                        {locked.length > 0 && (
                          <div
                            className="text-3xs text-muted-foreground"
                            title="Difference vs the unlocked population. Not a controlled comparison: players who commit to a build may differ in skill/lead."
                          >
                            {Math.round((pathStats.winRate - pathStats.baseWinRate) * 1000) === 0 ? (
                              "+0.0 pts"
                            ) : (
                              <Delta
                                value={(pathStats.winRate - pathStats.baseWinRate) * 100}
                                format="number"
                                unit=" pts"
                              />
                            )}{" "}
                            vs baseline*
                          </div>
                        )}
                      </div>
                    </div>

                    <KeyValueList variant="plain">
                      <KeyValue label="Matches" value={pathStats.matches.toLocaleString("en-US")} />
                      <KeyValue label="Players" value={pathStats.players.toLocaleString("en-US")} />
                      <KeyValue
                        label="W / L"
                        value={
                          <>
                            <span className="text-positive">{pathStats.wins.toLocaleString("en-US")}</span>
                            {" / "}
                            <span className="text-negative">{pathStats.losses.toLocaleString("en-US")}</span>
                          </>
                        }
                      />
                      {/* Without a locked path these read 100%, the headline again, 0 items and no cost. */}
                      {locked.length > 0 && (
                        <>
                          <KeyValue label="Path Frequency" value={`${(pathStats.pathFrequency * 100).toFixed(1)}%`} />
                          <KeyValue label="Overall WR" value={`${(pathStats.baseWinRate * 100).toFixed(1)}%`} />
                          <KeyValue
                            label="Build length"
                            value={`${locked.length} ${locked.length === 1 ? "item" : "items"}`}
                          />
                        </>
                      )}
                      <KeyValue
                        label="Avg KDA"
                        value={`${pathStats.avgKills.toFixed(1)} / ${pathStats.avgDeaths.toFixed(1)} / ${pathStats.avgAssists.toFixed(1)}`}
                      />
                      <KeyValue label="KDA Ratio" value={pathStats.kdaRatio.toFixed(2)} />
                      <KeyValue
                        label="Avg net worth"
                        value={Math.round(pathStats.avgNetWorth).toLocaleString("en-US")}
                      />
                      <KeyValue
                        label="Avg game length"
                        value={`${Math.floor(Math.round(pathStats.avgDurationS) / 60)}:${String(Math.round(pathStats.avgDurationS) % 60).padStart(2, "0")}`}
                      />
                      {locked.length > 0 && (
                        <KeyValue
                          label="Total Cost"
                          value={pathStats.totalCost > 0 ? `${pathStats.totalCost.toLocaleString("en-US")} souls` : "—"}
                        />
                      )}
                    </KeyValueList>

                    {locked.length === 0 && (
                      <Stack gap={2}>
                        <Separator />
                        <p className="text-2xs text-muted-foreground">
                          Click items in the graph to lock a build path and see its combined stats.
                        </p>
                      </Stack>
                    )}
                  </Stack>
                )}
              </PanelBody>
            </Panel>
          </aside>
        </div>
      </div>
    </Stack>
  );
}
