import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { ItemImage } from "~/components/ItemImage";
import { ItemName } from "~/components/ItemName";
import { LoadingLogo } from "~/components/LoadingLogo";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { cn } from "~/lib/utils";
import { filterShopableItems, itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { type FlowGroupBy, itemFlowQueryOptions } from "~/queries/item-flow-query";

const SLOT_COLORS: Record<string, string> = {
  weapon: "rgb(229, 138, 0)",
  vitality: "rgb(0, 255, 153)",
  spirit: "rgb(0, 221, 255)",
};

const TIER_SOULS: Record<number, number> = { 1: 500, 2: 1250, 3: 3000, 4: 6000 };

const CARD_W = 168;
const CARD_H = 58;
const COL_GAP = 104;
const ROW_GAP = 10;
const HEADER_H = 34;

interface ItemFlowGraphProps {
  heroId: number | null;
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  minMatches?: number | null;
  gameMode?: string;
}

interface PlacedNode {
  key: string;
  itemId: number;
  column: number;
  colIndex: number;
  x: number;
  y: number;
  wins: number;
  losses: number;
  matches: number;
  players: number;
  winRate: number;
  relWidth: number;
}

const PHASE_INTERVAL_S = 600;
const PHASE_COUNT = 4;

function columnLabel(groupBy: FlowGroupBy, column: number): { title: string; sub: string } {
  if (groupBy === "tier") {
    return { title: `Tier ${column}`, sub: `${TIER_SOULS[column]?.toLocaleString() ?? "?"} souls` };
  }
  const startMin = (column * PHASE_INTERVAL_S) / 60;
  const endMin = ((column + 1) * PHASE_INTERVAL_S) / 60;
  return {
    title: column === PHASE_COUNT - 1 ? `${startMin}m+` : `${startMin}–${endMin}m`,
    sub: "purchase time",
  };
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
  const [groupBy, setGroupBy] = useState<FlowGroupBy>("tier");
  const [perColumn, setPerColumn] = useState(6);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);

  const { data, isLoading } = useQuery(
    itemFlowQueryOptions({
      groupBy,
      heroIds: heroId != null ? [heroId] : undefined,
      gameMode,
      minAverageBadge: minRankId,
      maxAverageBadge: maxRankId,
      minUnixTimestamp: minUnixTimestamp ?? 0,
      maxUnixTimestamp,
      minMatches: minMatches ?? undefined,
      phaseIntervalS: PHASE_INTERVAL_S,
      phaseCount: PHASE_COUNT,
    }),
  );

  const { data: upgrades } = useQuery(itemUpgradesQueryOptions);
  const slotMap = useMemo(() => {
    const map = new Map<number, string>();
    if (upgrades) {
      for (const item of filterShopableItems(upgrades)) {
        if (item.item_slot_type) map.set(item.id, item.item_slot_type);
      }
    }
    return map;
  }, [upgrades]);

  const layout = useMemo(() => {
    if (!data) return null;

    const byColumn = new Map<number, typeof data.nodes>();
    for (const node of data.nodes) {
      const list = byColumn.get(node.column) ?? [];
      list.push(node);
      byColumn.set(node.column, list);
    }
    const columns = [...byColumn.keys()].sort((a, b) => a - b);
    if (columns.length === 0) return null;

    const placed = new Map<string, PlacedNode>();
    let maxRows = 0;
    columns.forEach((column, colIndex) => {
      const list = (byColumn.get(column) ?? [])
        .slice()
        .sort((a, b) => b.matches - a.matches)
        .slice(0, perColumn);
      const colMax = Math.max(1, ...list.map((n) => n.matches));
      maxRows = Math.max(maxRows, list.length);
      list.forEach((node, rowIndex) => {
        const key = `${column}:${node.item_id}`;
        placed.set(key, {
          key,
          itemId: node.item_id,
          column,
          colIndex,
          x: colIndex * (CARD_W + COL_GAP),
          y: HEADER_H + rowIndex * (CARD_H + ROW_GAP),
          wins: node.wins,
          losses: node.losses,
          matches: node.matches,
          players: node.players,
          winRate: node.matches > 0 ? node.wins / node.matches : 0,
          relWidth: node.matches / colMax,
        });
      });
    });

    const maxEdge = Math.max(1, ...data.edges.map((e) => e.matches));
    const edges = data.edges
      .map((e) => {
        const from = placed.get(`${e.from_column}:${e.from_item_id}`);
        const to = placed.get(`${e.from_column + 1}:${e.to_item_id}`);
        if (!from || !to) return null;
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

    const width = columns.length * CARD_W + (columns.length - 1) * COL_GAP;
    const height = HEADER_H + maxRows * (CARD_H + ROW_GAP);

    return { columns, placed: [...placed.values()], edges, width, height };
  }, [data, perColumn]);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          value={groupBy}
          onValueChange={(v) => v && setGroupBy(v as FlowGroupBy)}
          variant="outline"
        >
          <ToggleGroupItem value="tier" className="text-xs">
            By Tier
          </ToggleGroupItem>
          <ToggleGroupItem value="time" className="text-xs">
            By Time
          </ToggleGroupItem>
        </ToggleGroup>
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

      <p className="text-sm text-muted-foreground">
        {groupBy === "tier"
          ? "Items grouped by shop tier. Lines show how often a build moves from one item to an item in the next tier — thicker lines are more common transitions. Hover an item to trace its build paths."
          : "Items grouped by the in-match minute they were bought. Lines show the most common purchase-to-purchase progressions across phases. Hover an item to trace its build paths."}
      </p>

      {isLoading ? (
        <div className="flex w-full items-center justify-center py-24">
          <LoadingLogo />
        </div>
      ) : !layout ? (
        <p className="py-8 text-center text-muted-foreground">No item flow data available for the selected filters.</p>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="relative" style={{ width: layout.width, height: layout.height }}>
            {/* Column headers */}
            {layout.columns.map((column, colIndex) => {
              const { title, sub } = columnLabel(groupBy, column);
              return (
                <div
                  key={column}
                  className="absolute text-center"
                  style={{ left: colIndex * (CARD_W + COL_GAP), top: 0, width: CARD_W }}
                >
                  <div className="text-sm font-semibold">{title}</div>
                  <div className="text-[10px] text-muted-foreground">{sub}</div>
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
                const slotType = slotMap.get(node.itemId);
                const slotColor = (slotType && SLOT_COLORS[slotType]) || "var(--muted-foreground)";
                const wrPct = node.winRate * 100;
                return (
                  <Tooltip key={node.key}>
                    <TooltipTrigger asChild>
                      {/* biome-ignore lint/a11y/noStaticElementInteractions: hover-only highlight affordance */}
                      <div
                        className={cn(
                          "absolute flex flex-col justify-center gap-1 rounded-lg border border-l-2 bg-card/90 p-1.5 backdrop-blur-sm transition-opacity duration-200",
                          dimmed ? "opacity-30" : "opacity-100",
                        )}
                        style={{
                          left: node.x,
                          top: node.y,
                          width: CARD_W,
                          height: CARD_H,
                          borderLeftColor: slotColor,
                        }}
                        onMouseEnter={() => setHoveredKey(node.key)}
                        onMouseLeave={() => setHoveredKey(null)}
                      >
                        <div className="flex items-center gap-1.5">
                          <ItemImage itemId={node.itemId} className="size-7 shrink-0 rounded" />
                          <ItemName itemId={node.itemId} className="min-w-0 text-[11px] leading-tight font-medium" />
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${node.relWidth * 100}%`, backgroundColor: "#22d3ee" }}
                            />
                          </div>
                          <span
                            className={cn(
                              "shrink-0 font-semibold tabular-nums",
                              node.winRate >= 0.5 ? "text-green-400" : "text-red-400",
                            )}
                          >
                            {wrPct.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <div className="space-y-1">
                        <div className="font-semibold">
                          <ItemName itemId={node.itemId} />
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Win Rate</span>
                          <span className={node.winRate >= 0.5 ? "text-green-400" : "text-red-400"}>
                            {wrPct.toFixed(1)}%
                          </span>
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
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </TooltipProvider>
          </div>
        </div>
      )}
    </div>
  );
}
