import { useQuery } from "@tanstack/react-query";
import { Lock, Plus } from "lucide-react";
import { parseAsArrayOf, parseAsInteger, parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ItemImage } from "~/components/ItemImage";
import { ItemName } from "~/components/ItemName";
import { LoadingLogo } from "~/components/LoadingLogo";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { cn } from "~/lib/utils";
import { wilsonScoreInterval } from "~/lib/wilson";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { itemFlowQueryOptions } from "~/queries/item-flow-query";

const SLOT_COLORS: Record<string, string> = {
  weapon: "rgb(229, 138, 0)",
  vitality: "rgb(0, 255, 153)",
  spirit: "rgb(0, 221, 255)",
};

const CARD_W = 200;
const CARD_H = 94;
const MIN_COL_SPACING = CARD_W + 24;
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
  { maxWidth: 0.06, icon: "icon-[mdi--signal-cellular-3]", color: "text-green-400", label: "High", margin: "±3 pts" },
  {
    maxWidth: 0.12,
    icon: "icon-[mdi--signal-cellular-2]",
    color: "text-yellow-400",
    label: "Medium",
    margin: "±3–6 pts",
  },
  {
    maxWidth: 0.24,
    icon: "icon-[mdi--signal-cellular-1]",
    color: "text-orange-400",
    label: "Low",
    margin: "±6–12 pts",
  },
  {
    maxWidth: Number.POSITIVE_INFINITY,
    icon: "icon-[mdi--signal-cellular-outline]",
    color: "text-red-400",
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
const CONFIDENCE_FILTER_OPTIONS: { value: ConfidenceFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "low", label: "Low+" },
  { value: "medium", label: "Med+" },
  { value: "high", label: "High" },
];

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

function StageLockPicker({ candidates, onLock }: { candidates: Candidate[]; onLock: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 w-full gap-1 text-xs text-muted-foreground">
          <Plus className="size-3" />
          Lock item
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="max-h-[320px] w-64 overflow-y-auto p-1">
        {candidates.length === 0 ? (
          <div className="p-2 text-xs text-muted-foreground">No more items in this phase.</div>
        ) : (
          candidates.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onLock(c.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-accent"
            >
              <ItemImage itemId={c.id} className="size-5 shrink-0 rounded" />
              <ItemName itemId={c.id} className="min-w-0 flex-1 truncate text-xs" />
              <span
                className={cn(
                  "w-9 text-right text-[10px] tabular-nums",
                  c.winRate >= 0.5 ? "text-green-400" : "text-red-400",
                )}
              >
                {(c.winRate * 100).toFixed(1)}%
              </span>
              <span className="w-9 text-right text-[10px] text-cyan-400 tabular-nums">
                {(c.pickRate * 100).toFixed(1)}%
              </span>
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}

export function ItemFlowGraph({
  heroId,
  minRankId,
  maxRankId,
  minDate,
  maxDate,
  minMatches,
  gameMode,
}: ItemFlowGraphProps) {
  // View controls persisted in the URL (shareable), prefixed `flow_` to avoid clashing with
  // the page's other filters.
  const [perColumn, setPerColumn] = useQueryState("flow_top", parseAsInteger.withDefault(6));
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
  const [locked, setLocked] = useQueryState("build_path", parseAsArrayOf(parseAsString).withDefault([]));

  const isStreetBrawl = gameMode === "street_brawl";
  const columnCount = isStreetBrawl ? STREET_BRAWL_ROUNDS : PHASE_COUNT;

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

  const { data, isLoading, isFetching } = useQuery(
    itemFlowQueryOptions({
      heroIds: heroId != null ? String(heroId) : undefined,
      gameMode,
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
    const colSpacing = columns.length > 1 ? Math.max(MIN_COL_SPACING, (W - CARD_W) / (columns.length - 1)) : 0;
    const graphWidth = columns.length > 1 ? colSpacing * (columns.length - 1) + CARD_W : CARD_W;

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
      sortBy === "winrate"
        ? (a: Node, b: Node) => rawWr(b) - rawWr(a)
        : sortBy === "winrate_adj"
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

    const maxEdge = Math.max(1, ...data.edges.map((e) => e.matches));
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
          x1: from.x + CARD_W,
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
      placed: [...placed.values()],
      columnMeta,
      edges,
      width: graphWidth,
      height: maxBottom,
    };
  }, [data, perColumn, sortBy, minConfidence, excludedTiers, itemMeta, containerWidth, lockedSet, lockedColumns]);

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted-foreground">
              <span className="icon-[mdi--signal-cellular-2] size-4" />
              Confidence
              <span className="icon-[mdi--information-outline] size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 text-xs">
            <div className="mb-2 font-semibold">How reliable is a win rate?</div>
            <p className="mb-2 text-muted-foreground">
              The icon on each card shows how trustworthy its win rate is, based on the 95% confidence interval (mostly
              driven by how many matches it has). More bars = more certain.
            </p>
            <ul className="space-y-1.5">
              {CONFIDENCE_LEVELS.map((l) => (
                <li key={l.label} className="flex items-center gap-2">
                  <span className={cn(l.icon, "size-4 shrink-0", l.color)} />
                  <span className="w-16 shrink-0 font-medium">{l.label}</span>
                  <span className="text-muted-foreground">{l.margin}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground/80">
              {isStreetBrawl
                ? "Win rate reflects players who bought the item, not its causal effect."
                : "Win rates are adjusted for net worth at purchase (so they're not just “rich players win”), but remain observational — not a controlled causal estimate."}
            </p>
          </PopoverContent>
        </Popover>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Min confidence</span>
          <ToggleGroup
            type="single"
            value={minConfidence}
            onValueChange={(v) => v && setMinConfidence(v as ConfidenceFilter)}
            variant="outline"
          >
            {CONFIDENCE_FILTER_OPTIONS.map((o) => (
              <ToggleGroupItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Sort</span>
          <ToggleGroup
            type="single"
            value={sortBy}
            onValueChange={(v) => v && setSortBy(v as typeof sortBy)}
            variant="outline"
          >
            <ToggleGroupItem value="pickrate" className="text-xs">
              Pick rate
            </ToggleGroupItem>
            <ToggleGroupItem value="winrate" className="text-xs">
              Win rate
            </ToggleGroupItem>
            {!isStreetBrawl && (
              <ToggleGroupItem value="winrate_adj" className="text-xs">
                WR (adj.)
              </ToggleGroupItem>
            )}
          </ToggleGroup>
        </div>
        {!isStreetBrawl && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Bars</span>
            <ToggleGroup
              type="single"
              value={wrMode}
              onValueChange={(v) => v && setWrMode(v as typeof wrMode)}
              variant="outline"
            >
              <ToggleGroupItem value="adjusted" className="text-xs">
                Adjusted
              </ToggleGroupItem>
              <ToggleGroupItem value="raw" className="text-xs">
                Raw
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}
        <ToggleGroup
          type="single"
          value={String(perColumn)}
          onValueChange={(v) => v && setPerColumn(Number(v))}
          variant="outline"
        >
          {[4, 6, 8, 12].map((n) => (
            <ToggleGroupItem key={n} value={String(n)} className="text-xs">
              Top {n}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1" ref={wrapperRef}>
          {isLoading ? (
            <div className="flex w-full items-center justify-center py-24">
              <LoadingLogo />
            </div>
          ) : !layout ? (
            <p className="py-8 text-center text-muted-foreground">
              No item flow data available for the selected filters{locked.length > 0 ? " and build path" : ""}.
            </p>
          ) : (
            <div className="relative">
              {isFetching && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center pt-24">
                  <LoadingLogo />
                </div>
              )}
              <div className="overflow-x-auto pb-4">
                <div
                  className={cn("relative transition-opacity", isFetching && "opacity-40")}
                  style={{ width: layout.width, height: layout.height }}
                >
                  {/* Column headers: phase + reached% + lock picker */}
                  {layout.columnMeta.map((meta) => {
                    const { title, sub } = phaseLabel(meta.column, isStreetBrawl);
                    const reached = data
                      ? (data.reached_per_column[meta.column] ?? 0) / (data.baseline.matches || 1)
                      : 1;
                    return (
                      <div key={meta.column} className="absolute" style={{ left: meta.x, top: 0, width: CARD_W }}>
                        <div className="text-center text-sm font-semibold">{title}</div>
                        <div className="text-center text-[10px] text-muted-foreground">{sub}</div>
                        <div
                          className={cn(
                            "mb-1.5 text-center text-[10px]",
                            reached < 0.8 ? "text-amber-400" : "text-muted-foreground/70",
                          )}
                          title="Share of games that reached this stage (lower = more survivorship-selected, e.g. long games only)"
                        >
                          {(reached * 100).toFixed(0)}% of games reached
                        </div>
                        {meta.availableTiers.length > 1 && (
                          <div className="mb-1.5 flex justify-center gap-0.5">
                            {meta.availableTiers.map((t) => {
                              const off = excludedTiers.get(meta.column)?.has(t) ?? false;
                              return (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => toggleTier(meta.column, t)}
                                  className={cn(
                                    "rounded px-1.5 py-px text-[10px] font-medium transition-colors",
                                    off
                                      ? "bg-muted text-muted-foreground/50 hover:text-muted-foreground"
                                      : "bg-primary/15 text-primary hover:bg-primary/25",
                                  )}
                                  title={`${off ? "Show" : "Hide"} tier ${t} items in this stage`}
                                >
                                  T{t}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <StageLockPicker
                          candidates={meta.candidates}
                          onLock={(id) => toggleLock(`${meta.column}:${id}`)}
                        />
                      </div>
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
                      const active = !highlight || highlight.edges.has(e.id);
                      return (
                        <path
                          key={e.id}
                          d={`M ${e.x1} ${e.y1} C ${mx} ${e.y1}, ${mx} ${e.y2}, ${e.x2} ${e.y2}`}
                          fill="none"
                          stroke={e.winRate >= 0.5 ? "rgb(74, 222, 128)" : "rgb(248, 113, 113)"}
                          strokeWidth={e.width}
                          strokeOpacity={active ? (highlight ? 0.65 : 0.22) : 0.05}
                          className="transition-[stroke-opacity] duration-200"
                        />
                      );
                    })}
                  </svg>

                  {/* Nodes */}
                  <TooltipProvider delayDuration={150}>
                    {layout.placed.map((node) => {
                      const dimmed = highlight != null && !highlight.nodes.has(node.key);
                      const meta = itemMeta.get(node.itemId);
                      const slotColor = (meta?.slot && SLOT_COLORS[meta.slot]) || "var(--muted-foreground)";
                      const tier = meta?.tier ?? 0;
                      const cost = meta?.cost ?? 0;
                      // Headline win rate: adjusted by default, raw if toggled (always raw for brawl).
                      const showRaw = wrMode === "raw" || isStreetBrawl;
                      const displayWr = showRaw ? node.winRate : node.adjWinRate;
                      const wrPct = displayWr * 100;
                      const wrBar = showRaw ? node.wrBarRaw : node.wrBar;
                      const conf = confidenceLevel(node.wrLow, node.wrHigh);
                      return (
                        <Tooltip key={node.key}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                "absolute flex flex-col justify-center gap-1.5 rounded-lg border border-l-2 bg-card/90 p-2 text-left backdrop-blur-sm transition-[opacity,border-color,background-color] duration-200",
                                dimmed ? "opacity-30" : "opacity-100",
                                node.locked
                                  ? "border-primary bg-primary/10"
                                  : "border-border hover:border-muted-foreground",
                              )}
                              style={{
                                left: node.x,
                                top: node.y,
                                width: CARD_W,
                                height: CARD_H,
                                borderLeftColor: node.locked ? undefined : slotColor,
                              }}
                              onMouseEnter={() => setHoveredKey(node.key)}
                              onMouseLeave={() => setHoveredKey(null)}
                              onClick={() => toggleLock(node.key)}
                            >
                              <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                                {node.locked && <Lock className="size-3 text-primary" />}
                                <span
                                  className={cn(conf.icon, "size-3.5", conf.color)}
                                  title={`Confidence: ${conf.label} — ${node.matches.toLocaleString()} matches, 95% CI ${(node.wrLow * 100).toFixed(1)}–${(node.wrHigh * 100).toFixed(1)}%`}
                                />
                              </div>
                              <div className="flex items-center gap-2 pr-9">
                                <ItemImage itemId={node.itemId} className="size-9 shrink-0 rounded-lg" />
                                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                  <ItemName
                                    itemId={node.itemId}
                                    className="truncate text-xs leading-tight font-semibold"
                                  />
                                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                    {tier > 0 && (
                                      <span className="rounded-full bg-muted px-1.5 py-px font-medium">T{tier}</span>
                                    )}
                                    {cost > 0 && <span className="tabular-nums">{cost.toLocaleString()}</span>}
                                  </span>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-[10px]">
                                  <span className="w-[16px] shrink-0 font-medium text-muted-foreground">WR</span>
                                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                    <div
                                      className="h-full rounded-full"
                                      style={{ width: `${wrBar * 100}%`, backgroundColor: "#fa4454" }}
                                    />
                                  </div>
                                  <span
                                    className={cn(
                                      "w-[34px] shrink-0 text-right font-semibold tabular-nums",
                                      displayWr >= 0.5 ? "text-green-400" : "text-red-400",
                                    )}
                                  >
                                    {wrPct.toFixed(1)}%
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px]">
                                  <span className="w-[16px] shrink-0 font-medium text-muted-foreground">PR</span>
                                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                    <div
                                      className="h-full rounded-full"
                                      style={{ width: `${node.pickBar * 100}%`, backgroundColor: "#22d3ee" }}
                                    />
                                  </div>
                                  <span className="w-[34px] shrink-0 text-right font-semibold text-cyan-400 tabular-nums">
                                    {(node.pickRate * 100).toFixed(1)}%
                                  </span>
                                </div>
                              </div>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="border border-border bg-popover text-xs text-popover-foreground [&>svg]:bg-popover [&>svg]:fill-popover"
                          >
                            <div className="space-y-1">
                              <div className="font-semibold">
                                <ItemName itemId={node.itemId} />
                              </div>
                              {isStreetBrawl ? (
                                <div className="flex justify-between gap-4">
                                  <span className="text-muted-foreground">Win Rate</span>
                                  <span className={node.winRate >= 0.5 ? "text-green-400" : "text-red-400"}>
                                    {(node.winRate * 100).toFixed(1)}%
                                  </span>
                                </div>
                              ) : (
                                <>
                                  <div className="flex justify-between gap-4">
                                    <span className="text-muted-foreground">Win Rate (adj.)</span>
                                    <span className={node.adjWinRate >= 0.5 ? "text-green-400" : "text-red-400"}>
                                      {(node.adjWinRate * 100).toFixed(1)}%
                                    </span>
                                  </div>
                                  <div className="flex justify-between gap-4">
                                    <span className="text-muted-foreground">Raw win rate</span>
                                    <span className="tabular-nums">{(node.winRate * 100).toFixed(1)}%</span>
                                  </div>
                                </>
                              )}
                              <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">95% CI (raw)</span>
                                <span className="tabular-nums">
                                  {(node.wrLow * 100).toFixed(1)}–{(node.wrHigh * 100).toFixed(1)}%
                                </span>
                              </div>
                              {!isStreetBrawl && (
                                <div className="flex justify-between gap-4">
                                  <span className="text-muted-foreground">Avg net worth at buy</span>
                                  <span className="tabular-nums">{Math.round(node.avgNetWorth).toLocaleString()}</span>
                                </div>
                              )}
                              <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">Pick Rate (phase)</span>
                                <span className="text-cyan-400">{(node.pickRate * 100).toFixed(1)}%</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">Chained Pick Rate</span>
                                <span className="text-cyan-400/70">{(node.chainPickRate * 100).toFixed(1)}%</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">Matches</span>
                                <span>{node.matches.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">Players</span>
                                <span>{node.players.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">W / L</span>
                                <span>
                                  <span className="text-green-400">{node.wins.toLocaleString()}</span>
                                  {" / "}
                                  <span className="text-red-400">{node.losses.toLocaleString()}</span>
                                </span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">Avg KDA</span>
                                <span>
                                  {node.avgKills.toFixed(1)} / {node.avgDeaths.toFixed(1)} /{" "}
                                  {node.avgAssists.toFixed(1)}
                                </span>
                              </div>
                              <div className="border-t border-border pt-1 text-[10px] text-muted-foreground">
                                {node.locked ? "Click to remove from build path" : "Click to lock into build path"}
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </TooltipProvider>
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="w-full shrink-0 self-start rounded-xl border border-border bg-card/60 p-4 lg:w-64">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Build Path Summary</h3>
            {locked.length > 0 && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setLocked([])}>
                Clear
              </Button>
            )}
          </div>
          {!pathStats ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="flex items-end justify-between">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  Win Rate
                  {(() => {
                    const c = confidenceLevel(pathStats.wrLow, pathStats.wrHigh);
                    return (
                      <span
                        className={cn(c.icon, "size-4", c.color)}
                        title={`Confidence: ${c.label} — ${pathStats.matches.toLocaleString()} matches`}
                      />
                    );
                  })()}
                </div>
                <div className="text-right">
                  <span
                    className={cn(
                      "text-lg font-bold tabular-nums",
                      pathStats.winRate >= 0.5 ? "text-green-400" : "text-red-400",
                    )}
                  >
                    {(pathStats.winRate * 100).toFixed(1)}%
                  </span>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    95% CI {(pathStats.wrLow * 100).toFixed(1)}–{(pathStats.wrHigh * 100).toFixed(1)}%
                  </div>
                  {locked.length > 0 && (
                    <div
                      className="text-[10px] text-muted-foreground"
                      title="Difference vs the unlocked population. Not a controlled comparison — players who commit to a build may differ in skill/lead."
                    >
                      {pathStats.winRate - pathStats.baseWinRate >= 0 ? "+" : ""}
                      {((pathStats.winRate - pathStats.baseWinRate) * 100).toFixed(1)} pts vs baseline*
                    </div>
                  )}
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                <div>
                  <dt className="text-muted-foreground">Matches</dt>
                  <dd className="font-semibold tabular-nums">{pathStats.matches.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Players</dt>
                  <dd className="font-semibold tabular-nums">{pathStats.players.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">W / L</dt>
                  <dd className="font-semibold tabular-nums">
                    <span className="text-green-400">{pathStats.wins.toLocaleString()}</span>
                    {" / "}
                    <span className="text-red-400">{pathStats.losses.toLocaleString()}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Path Frequency</dt>
                  <dd className="font-semibold tabular-nums">{(pathStats.pathFrequency * 100).toFixed(1)}%</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Overall WR</dt>
                  <dd className="font-semibold tabular-nums">{(pathStats.baseWinRate * 100).toFixed(1)}%</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Build length</dt>
                  <dd className="font-semibold tabular-nums">
                    {locked.length} {locked.length === 1 ? "item" : "items"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Avg KDA</dt>
                  <dd className="font-semibold tabular-nums">
                    {pathStats.avgKills.toFixed(1)} / {pathStats.avgDeaths.toFixed(1)} /{" "}
                    {pathStats.avgAssists.toFixed(1)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">KDA Ratio</dt>
                  <dd className="font-semibold tabular-nums">{pathStats.kdaRatio.toFixed(2)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Avg net worth</dt>
                  <dd className="font-semibold tabular-nums">{Math.round(pathStats.avgNetWorth).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Avg game length</dt>
                  <dd className="font-semibold tabular-nums">
                    {Math.floor(pathStats.avgDurationS / 60)}:
                    {String(Math.round(pathStats.avgDurationS % 60)).padStart(2, "0")}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Total Cost</dt>
                  <dd className="font-semibold tabular-nums">
                    {pathStats.totalCost > 0 ? `${pathStats.totalCost.toLocaleString()} souls` : "—"}
                  </dd>
                </div>
              </dl>

              {locked.length === 0 && (
                <p className="border-t border-border pt-2 text-[11px] text-muted-foreground/70">
                  Click items in the graph to lock a build path and see its combined stats.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
