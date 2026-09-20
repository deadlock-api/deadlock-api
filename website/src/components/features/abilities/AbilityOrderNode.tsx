import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useRef } from "react";

import { AbilityImage } from "~/components/domain/assets/AbilityImage";
import { AbilityName } from "~/components/domain/assets/AbilityName";
import { GraphNodeCard } from "~/components/domain/graph/GraphNodeCard";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/panel-tooltip";
import { Separator } from "~/components/ui/separator";
import type { AbilityTrieNode } from "~/lib/ability-order-utils";
import { getPickRate, getSortedChildren, getWinRate } from "~/lib/ability-order-utils";
import { TONE_TEXT, toneOf } from "~/lib/tone";

interface AbilitySlotMap {
  get(abilityId: number): number | undefined;
}

const SLOT_ACCENT = { 1: "ability-1", 2: "ability-2", 3: "ability-3", 4: "ability-4" } as const;

export interface AbilityOrderNodeProps {
  node: AbilityTrieNode;
  parentMatches: number;
  rootMatches: number;
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
  rootMatches,
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

  // Full strength from a 50% pick rate, faintest (the card's 60% opacity step) at 30% and below.
  const emphasis = (pickRate * 2 - 0.6) / 0.4;

  const chainPickRate = rootMatches > 0 ? node.matches / rootMatches : 0;
  const wrPercent = winRate * 100;
  const prPercent = pickRate * 100;
  const chainPrPercent = chainPickRate * 100;

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
      <GraphNodeCard
        data-ability-card
        className="w-40"
        accent={slot ? SLOT_ACCENT[slot as keyof typeof SLOT_ACCENT] : "none"}
        fill="accent"
        emphasis={emphasis}
        selected={isFocused}
        onClick={isFocusable ? () => onToggleFocus(currentPath) : undefined}
        media={
          node.abilityId != null ? <AbilityImage abilityId={node.abilityId} className="size-10 shrink-0" /> : undefined
        }
        name={node.abilityId != null ? <AbilityName abilityId={node.abilityId} /> : "Root"}
        meta={
          <>
            <Badge variant="muted" size="sm">
              T{abilityLevel}
            </Badge>
            <span>{cumulativePoints} pts</span>
          </>
        }
        winRate={winRate}
        pickRate={pickRate}
        tooltipSide="right"
        tooltip={
          <>
            <TooltipHeader title={`T${abilityLevel} · ${cumulativePoints} ability points spent`} />
            <TooltipStats>
              <TooltipStat
                label="Win Rate"
                value={`${wrPercent.toFixed(1)}%`}
                className={TONE_TEXT[toneOf(winRate, 0.5)]}
              />
              <TooltipStat label="Pick Rate" value={`${prPercent.toFixed(1)}%`} />
              <TooltipStat label="Chain Pick Rate" value={`${chainPrPercent.toFixed(1)}%`} />
              <TooltipStat label="Players" value={node.players.toLocaleString("en-US")} />
              <TooltipStat label="Matches" value={node.matches.toLocaleString("en-US")} />
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
              <TooltipStat label="Avg KDA" value={`${avgKills} / ${avgDeaths} / ${avgAssists}`} />
            </TooltipStats>
          </>
        }
      />

      {/* Expand/collapse button */}
      {hasChildren && !isWithinDefaultDepth && siblingCount !== 1 && (
        <div className="pt-1.5">
          <Button
            variant={isExpanded ? "secondary" : "soft"}
            size="xs"
            shape="pill"
            aria-expanded={isExpanded}
            onClick={() => onToggleExpand(currentPath)}
          >
            <ChevronDown />
            {isExpanded ? "Hide" : `${sortedChildren.length} ${sortedChildren.length === 1 ? "path" : "paths"}`}
          </Button>
        </div>
      )}

      {/* Children (animated entry) */}
      {hasChildren && isExpanded && (
        <div className="flex flex-col items-center">
          {/* Connector line down */}
          <div className="flex h-4 justify-center">
            <Separator orientation="vertical" />
          </div>

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
                <motion.div key={child.abilityId} className="flex flex-1 flex-col items-center" variants={fadeUp}>
                  {/* Horizontal connector segments + vertical drop */}
                  <div className="flex h-4 self-stretch">
                    <div className="flex-1">{!isFirst && <Separator />}</div>
                    <Separator orientation="vertical" />
                    <div className="flex-1">{!isLast && <Separator />}</div>
                  </div>
                  <div className="px-0.5">
                    <AbilityOrderNode
                      node={child}
                      parentMatches={node.matches}
                      rootMatches={rootMatches}
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
