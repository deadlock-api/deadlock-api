import { ChevronDown } from "lucide-react";
import { useRef } from "react";
import { motion } from "framer-motion";
import AbilityImage from "~/components/AbilityImage";
import AbilityName from "~/components/AbilityName";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import type { AbilityTrieNode } from "~/lib/ability-order-utils";
import { getPickRate, getSortedChildren, getWinRate } from "~/lib/ability-order-utils";
import { cn } from "~/lib/utils";

interface AbilitySlotMap {
  get(abilityId: number): number | undefined;
}

const SLOT_COLORS: Record<number, string> = {
  1: "border-l-blue-500",
  2: "border-l-green-500",
  3: "border-l-purple-500",
  4: "border-l-orange-500",
};

const SLOT_BG_COLORS: Record<number, string> = {
  1: "bg-blue-500/10",
  2: "bg-green-500/10",
  3: "bg-purple-500/10",
  4: "bg-orange-500/10",
};

export interface AbilityOrderNodeProps {
  node: AbilityTrieNode;
  parentMatches: number;
  abilitySlotMap: AbilitySlotMap;
  defaultDepth: number;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  focusedPaths: Set<string>;
  onToggleFocus: (path: string) => void;
  currentPath: string;
  ancestorAbilityIds: number[];
  totalPointsSpent: number;
  isStreetBrawl: boolean;
  siblingCount: number;
  index: number;
}

// Normal mode: T0 (unlock) = 0, T1 = 1, T2 = 2, T3 = 5
const NORMAL_LEVEL_COST = [0, 1, 2, 5] as const;
// Street Brawl: all start at T0, so T1 = 1, T2 = 2, T3 = 5
const BRAWL_LEVEL_COST = [1, 2, 5] as const;

const childStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: "easeOut" as const },
  },
};

export default function AbilityOrderNode({
  node,
  parentMatches,
  abilitySlotMap,
  defaultDepth,
  expandedPaths,
  onToggleExpand,
  focusedPaths,
  onToggleFocus,
  currentPath,
  ancestorAbilityIds,
  totalPointsSpent,
  isStreetBrawl,
  siblingCount,
  index,
}: AbilityOrderNodeProps) {
  const slot = node.abilityId != null ? abilitySlotMap.get(node.abilityId) : undefined;
  const rawLevel = node.abilityId != null ? ancestorAbilityIds.filter((id) => id === node.abilityId).length : 0;
  const abilityLevel = isStreetBrawl ? rawLevel + 1 : rawLevel;
  const costTable = isStreetBrawl ? BRAWL_LEVEL_COST : NORMAL_LEVEL_COST;
  const nodeCost = costTable[rawLevel] ?? 0;
  const cumulativePoints = totalPointsSpent + nodeCost;
  const childAncestorIds = node.abilityId != null ? [...ancestorAbilityIds, node.abilityId] : ancestorAbilityIds;
  const winRate = getWinRate(node);
  const pickRate = getPickRate(node, parentMatches);
  const sortedChildren = getSortedChildren(node);
  const hasChildren = sortedChildren.length > 0;

  const isWithinDefaultDepth = node.depth < defaultDepth;
  const isExpanded = isWithinDefaultDepth || expandedPaths.has(currentPath) || siblingCount === 1;
  const isFocusable = siblingCount !== 1;
  const isFocused = isFocusable && focusedPaths.has(currentPath);

  const focusedChild = sortedChildren.find((child) => focusedPaths.has(`${currentPath}/${child.abilityId}`));
  const displayedChildren = focusedChild ? [focusedChild] : sortedChildren;

  const opacity = Math.max(0.6, Math.min(1.0, pickRate * 2));
  const slotColor = slot ? SLOT_COLORS[slot] : "border-l-muted-foreground";
  const slotBg = slot ? SLOT_BG_COLORS[slot] : "";

  const wrPercent = winRate * 100;
  const prPercent = pickRate * 100;

  const avgKills = node.matches > 0 ? (node.totalKills / node.matches).toFixed(1) : "0";
  const avgDeaths = node.matches > 0 ? (node.totalDeaths / node.matches).toFixed(1) : "0";
  const avgAssists = node.matches > 0 ? (node.totalAssists / node.matches).toFixed(1) : "0";

  const childrenRowRef = useRef<HTMLDivElement>(null);

  return (
    <motion.div
      className="flex flex-col items-center"
      variants={fadeUp}
      initial="hidden"
      animate="show"
      transition={{ delay: index * 0.06 }}
    >
      {/* Node card with tooltip */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              data-ability-card
              className={cn(
                "border border-l-2 rounded-lg p-2 w-[160px] transition-all",
                isFocusable && "cursor-pointer",
                "bg-card/80 backdrop-blur-sm",
                slotColor,
                slotBg,
                isFocused ? "border-primary ring-1 ring-primary/50" : "border-border hover:border-muted-foreground",
              )}
              style={{ opacity }}
              onClick={isFocusable ? () => onToggleFocus(currentPath) : undefined}
            >
              {/* Header: icon + name + tier pill */}
              <div className="flex items-center gap-2 mb-2">
                {node.abilityId != null ? (
                  <AbilityImage abilityId={node.abilityId} className="size-10 shrink-0 rounded-lg" />
                ) : (
                  <div className="size-10 shrink-0 rounded-lg bg-muted" />
                )}
                <div className="flex flex-col min-w-0 gap-0.5">
                  {node.abilityId != null ? (
                    <AbilityName abilityId={node.abilityId} className="text-xs font-semibold leading-tight" />
                  ) : (
                    <span className="text-xs font-semibold leading-tight">Root</span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="px-1.5 py-px rounded-full bg-muted text-[10px] font-medium">T{abilityLevel}</span>
                    <span>{cumulativePoints} pts</span>
                  </span>
                </div>
              </div>

              {/* Stat bars */}
              <div className="space-y-1">
                {/* Win Rate */}
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-muted-foreground font-medium w-[18px] shrink-0">WR</span>
                  <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300 ease-out"
                      style={{
                        width: `${wrPercent}%`,
                        backgroundColor: "#fa4454",
                      }}
                    />
                  </div>
                  <span
                    className={cn(
                      "font-semibold tabular-nums w-[38px] text-right shrink-0",
                      winRate >= 0.5 ? "text-green-400" : "text-red-400",
                    )}
                  >
                    {wrPercent.toFixed(1)}%
                  </span>
                </div>

                {/* Pick Rate */}
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-muted-foreground font-medium w-[18px] shrink-0">PR</span>
                  <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300 ease-out"
                      style={{
                        width: `${prPercent}%`,
                        backgroundColor: "#22d3ee",
                      }}
                    />
                  </div>
                  <span className="font-semibold tabular-nums text-cyan-400 w-[38px] text-right shrink-0">
                    {prPercent.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            className="max-w-[220px] p-0 overflow-hidden bg-popover text-popover-foreground border border-border [&>svg]:fill-popover [&>svg]:bg-popover"
          >
            <div className="text-xs">
              {/* Header */}
              <div className={cn("px-3 py-1.5 font-semibold", slotBg)}>
                T{abilityLevel} · {cumulativePoints} ability points spent
              </div>
              {/* Stats grid */}
              <div className="px-3 py-2 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Win Rate</span>
                  <span className={cn("font-medium", winRate >= 0.5 ? "text-green-400" : "text-red-400")}>
                    {wrPercent.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pick Rate</span>
                  <span className="font-medium text-cyan-400">{prPercent.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Matches</span>
                  <span className="font-medium">{node.matches.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">W / L</span>
                  <span>
                    <span className="text-green-400 font-medium">{node.wins.toLocaleString()}</span>
                    {" / "}
                    <span className="text-red-400 font-medium">{node.losses.toLocaleString()}</span>
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg KDA</span>
                  <span className="font-medium">
                    {avgKills} / {avgDeaths} / {avgAssists}
                  </span>
                </div>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Expand/collapse button */}
      {hasChildren && !isWithinDefaultDepth && siblingCount !== 1 && (
        <button
          type="button"
          className={cn(
            "mt-1.5 flex items-center justify-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
            isExpanded
              ? "bg-muted text-muted-foreground hover:bg-muted/80"
              : "bg-primary/15 text-primary hover:bg-primary/25",
          )}
          onClick={() => onToggleExpand(currentPath)}
        >
          {isExpanded ? (
            <>
              <ChevronDown className="size-3" />
              Hide
            </>
          ) : (
            <>
              <ChevronDown className="size-3" />
              {sortedChildren.length} {sortedChildren.length === 1 ? "path" : "paths"}
            </>
          )}
        </button>
      )}

      {/* Children (animated entry) */}
      {hasChildren && isExpanded && (
        <div className="flex flex-col items-center">
          {/* Connector line down */}
          <div className="h-4 border-l border-muted-foreground/30" />

          {/* Children row */}
          <motion.div
            ref={childrenRowRef}
            className="flex items-start"
            variants={childStagger}
            initial="hidden"
            animate="show"
          >
            {displayedChildren.map((child, i) => {
              const childPath = `${currentPath}/${child.abilityId}`;
              const isFirst = i === 0;
              const isLast = i === displayedChildren.length - 1;
              return (
                <motion.div key={child.abilityId} className="flex flex-col items-center flex-1" variants={fadeUp}>
                  {/* Horizontal connector segments + vertical drop */}
                  <div className="flex self-stretch h-4">
                    <div className={cn("flex-1 border-muted-foreground/30", !isFirst && "border-t")} />
                    <div className="h-full border-l border-muted-foreground/30" />
                    <div className={cn("flex-1 border-muted-foreground/30", !isLast && "border-t")} />
                  </div>
                  <div className="px-0.5">
                    <AbilityOrderNode
                      node={child}
                      parentMatches={node.matches}
                      abilitySlotMap={abilitySlotMap}
                      defaultDepth={defaultDepth}
                      expandedPaths={expandedPaths}
                      onToggleExpand={onToggleExpand}
                      focusedPaths={focusedPaths}
                      onToggleFocus={onToggleFocus}
                      currentPath={childPath}
                      ancestorAbilityIds={childAncestorIds}
                      totalPointsSpent={cumulativePoints}
                      isStreetBrawl={isStreetBrawl}
                      siblingCount={sortedChildren.length}
                      index={i}
                    />
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
