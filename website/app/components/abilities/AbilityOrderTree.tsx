import { useQuery } from "@tanstack/react-query";
import type { AbilityOrderStatsGameModeEnum } from "deadlock_api_client";
import { motion } from "framer-motion";
import { useCallback, useMemo, useRef, useState } from "react";

import { LoadingLogo } from "~/components/LoadingLogo";
import { CACHE_DURATIONS } from "~/constants/cache";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { buildAbilityTrie, getSortedChildren, mergeStreetBrawlRows } from "~/lib/ability-order-utils";
import { assetsApi } from "~/lib/assets-api";
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
  defaultDepth,
  includeItemIds,
  excludeItemIds,
}: AbilityOrderTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [focusedPaths, setFocusedPaths] = useState<Set<string>>(new Set());

  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);

  const abilityOrderStatsQuery = {
    heroId,
    minAverageBadge: minRankId ?? 0,
    maxAverageBadge: maxRankId ?? 116,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    minMatches: minMatches,
    gameMode,
    includeItemIds: includeItemIds?.length ? includeItemIds : undefined,
    excludeItemIds: excludeItemIds?.length ? excludeItemIds : undefined,
  };

  const { data: abilityOrderData, isLoading: isLoadingOrder } = useQuery(
    abilityOrderQueryOptions(abilityOrderStatsQuery),
  );

  const { data: heroData } = useQuery({
    queryKey: queryKeys.assets.hero(heroId),
    queryFn: async () => {
      const response = await assetsApi.heroes_api.getHeroV2HeroesIdGet({
        id: heroId,
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

  const onToggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const onToggleFocus = useCallback((path: string) => {
    setFocusedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        // Unfocus: remove this path and all descendant focused/expanded paths
        const prefix = `${path}/`;
        for (const p of prev) {
          if (p === path || p.startsWith(prefix)) {
            next.delete(p);
          }
        }
        setExpandedPaths((prevExpanded) => {
          const nextExpanded = new Set(prevExpanded);
          nextExpanded.delete(path);
          for (const p of prevExpanded) {
            if (p.startsWith(prefix)) {
              nextExpanded.delete(p);
            }
          }
          return nextExpanded;
        });
      } else {
        next.add(path);
        // Auto-expand the focused node so its children are visible
        setExpandedPaths((prevExpanded) => {
          const nextExpanded = new Set(prevExpanded);
          nextExpanded.add(path);
          return nextExpanded;
        });
      }
      return next;
    });
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({
    isDragging: false,
    didDrag: false,
    startX: 0,
    scrollLeft: 0,
  });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    dragState.current = {
      isDragging: true,
      didDrag: false,
      startX: e.clientX,
      scrollLeft: el.scrollLeft,
    };
    el.style.cursor = "grabbing";
    el.style.userSelect = "none";
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const ds = dragState.current;
    if (!ds.isDragging) return;
    const dx = e.clientX - ds.startX;
    if (Math.abs(dx) > 3) ds.didDrag = true;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = ds.scrollLeft - dx;
  }, []);

  const onMouseUp = useCallback(() => {
    dragState.current.isDragging = false;
    const el = scrollRef.current;
    if (!el) return;
    el.style.cursor = "";
    el.style.userSelect = "";
  }, []);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (dragState.current.didDrag) {
      e.stopPropagation();
      dragState.current.didDrag = false;
    }
  }, []);

  if (isLoadingOrder) {
    return (
      <div className="flex w-full items-center justify-center py-24">
        <LoadingLogo />
      </div>
    );
  }

  if (!trie || trie.children.size === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        No ability order data available for this hero with the selected filters.
      </p>
    );
  }

  const rootChildren = getSortedChildren(trie);
  const focusedRoot = rootChildren.find((child) => focusedPaths.has(String(child.abilityId)));
  const displayedRoots = focusedRoot ? [focusedRoot] : rootChildren;

  return (
    <div
      role="presentation"
      ref={scrollRef}
      className="cursor-grab overflow-x-auto pb-4 text-center"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onClickCapture={onClickCapture}
    >
      {gameMode === "street_brawl" && (
        <p className="mb-2 text-sm text-balance text-muted-foreground">
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
          show: { transition: { staggerChildren: 0.06 } },
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
    </div>
  );
}
