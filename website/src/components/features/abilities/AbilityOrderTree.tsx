import { useQuery } from "@tanstack/react-query";
import type { AbilityOrderStatsGameModeEnum } from "deadlock_api_client";
import { motion, MotionConfig, stagger } from "framer-motion";
import { useCallback, useMemo, useState } from "react";

import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { DragScroll } from "~/components/ui/drag-scroll";
import { CACHE_DURATIONS } from "~/constants/cache";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { buildAbilityTrie, getSortedChildren, mergeStreetBrawlRows } from "~/lib/ability-order-utils";
import { api } from "~/lib/api";
import type { MatchMode } from "~/lib/game-mode";
import { abilityOrderQueryOptions } from "~/queries/ability-order-query";
import { abilitiesQueryOptions } from "~/queries/asset-queries";
import { queryKeys } from "~/queries/query-keys";

import AbilityOrderNode from "./AbilityOrderNode";

const HERO_ABILITY_SLOTS = ["signature1", "signature2", "signature3", "signature4"] as const;

interface AbilityOrderTreeProps {
  heroId: number;
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  minMatches?: number | null;
  gameMode?: AbilityOrderStatsGameModeEnum;
  matchMode?: MatchMode;
  defaultDepth: number;
  includeItemIds?: number[];
  excludeItemIds?: number[];
}

export default function AbilityOrderTree({
  heroId,
  minRankId,
  maxRankId,
  minDate,
  maxDate,
  minMatches,
  gameMode,
  matchMode,
  defaultDepth,
  includeItemIds,
  excludeItemIds,
}: AbilityOrderTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [focusedPaths, setFocusedPaths] = useState<Set<string>>(new Set());

  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);

  const abilityOrderStatsQuery = {
    heroId,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    minMatches: minMatches,
    gameMode,
    matchMode,
    includeItemIds: includeItemIds?.length ? includeItemIds : undefined,
    excludeItemIds: excludeItemIds?.length ? excludeItemIds : undefined,
  };

  const {
    data: abilityOrderData,
    isLoading: isLoadingOrder,
    isError: isOrderError,
    refetch: refetchOrder,
  } = useQuery(abilityOrderQueryOptions(abilityOrderStatsQuery));

  const { data: heroData } = useQuery({
    queryKey: queryKeys.assets.hero(heroId),
    queryFn: async () => {
      const response = await api.heroes_api.getHero({
        heroId,
      });
      return response.data;
    },
    staleTime: CACHE_DURATIONS.FOREVER,
  });

  const { data: abilityItems } = useQuery(abilitiesQueryOptions);

  const abilitySlotMap = useMemo(() => {
    const map = new Map<number, number>();
    if (!heroData || !abilityItems) return map;

    for (let i = 0; i < HERO_ABILITY_SLOTS.length; i++) {
      const slot = HERO_ABILITY_SLOTS[i];
      const className = heroData.items?.[slot];
      if (!className) continue;

      const ability = abilityItems.find((item) => item.class_name === className);
      if (!ability) continue;

      map.set(ability.id, i + 1);
    }

    return map;
  }, [heroData, abilityItems]);

  const trie = useMemo(() => {
    if (!abilityOrderData) return null;
    const rows = gameMode === "street_brawl" ? mergeStreetBrawlRows(abilityOrderData) : abilityOrderData;
    return buildAbilityTrie(rows);
  }, [abilityOrderData, gameMode]);

  // The first node sits over the middle of a tree wider than a phone; start the scroll there, not at the left edge,
  // where it showed half cut off.
  // A new callback per tree, so React calls it again, with the element, whenever a new tree is drawn.
  const centerScroll = useCallback(
    (el: HTMLDivElement | null) => {
      if (el && trie) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    },
    [trie],
  );

  const onToggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  };

  // Focusing a node expands it, so its children show; unfocusing it drops it and every path below it from both sets.
  const onToggleFocus = (path: string) => {
    if (focusedPaths.has(path)) {
      const prefix = `${path}/`;
      const outsideSubtree = (paths: Set<string>) =>
        new Set([...paths].filter((p) => p !== path && !p.startsWith(prefix)));
      setFocusedPaths(outsideSubtree);
      setExpandedPaths(outsideSubtree);
    } else {
      setFocusedPaths((prev) => new Set(prev).add(path));
      setExpandedPaths((prev) => new Set(prev).add(path));
    }
  };

  if (isLoadingOrder) {
    return <LoadingState label="ability orders" className="flex w-full items-center justify-center py-24" />;
  }

  if (isOrderError && !abilityOrderData) {
    return <ErrorState title="Ability orders did not load" onRetry={() => void refetchOrder()} />;
  }

  if (!trie || trie.children.size === 0) {
    return (
      <EmptyState variant="inline" title="No ability order data available for this hero with the selected filters." />
    );
  }

  const rootChildren = getSortedChildren(trie);
  const focusedRoot = rootChildren.find((child) => focusedPaths.has(String(child.abilityId)));
  const displayedRoots = focusedRoot ? [focusedRoot] : rootChildren;

  return (
    // `user`: the tree's entrance and expand animations follow the reduced-motion setting, like the games' Motion.
    <MotionConfig reducedMotion="user">
      <DragScroll ref={centerScroll} className="pb-4 text-center">
        {gameMode === "street_brawl" && (
          <p className="pb-2 text-sm text-balance text-muted-foreground">
            In Street Brawl, you unlock multiple abilities at once per round. Since the order within each round doesn't
            matter, paths that only differ in that order are shown as one.
          </p>
        )}
        <motion.div
          className="inline-flex min-w-max items-start gap-0.5 p-4"
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { delayChildren: stagger(0.06) } },
          }}
        >
          {displayedRoots.map((child, i) => {
            const childPath = String(child.abilityId);
            return (
              <div key={child.abilityId} className="flex flex-col items-center">
                <AbilityOrderNode
                  node={child}
                  parentMatches={trie.matches}
                  rootMatches={trie.matches}
                  abilitySlotMap={abilitySlotMap}
                  defaultDepth={defaultDepth}
                  expandedPaths={expandedPaths}
                  onToggleExpand={onToggleExpand}
                  focusedPaths={focusedPaths}
                  onToggleFocus={onToggleFocus}
                  currentPath={childPath}
                  ancestorAbilityIds={[]}
                  totalPointsSpent={0}
                  isStreetBrawl={gameMode === "street_brawl"}
                  siblingCount={rootChildren.length}
                  index={i}
                />
              </div>
            );
          })}
        </motion.div>
      </DragScroll>
    </MotionConfig>
  );
}
