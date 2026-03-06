import { useQuery } from "@tanstack/react-query";
import type { AbilityV2 } from "assets_deadlock_api_client/api";
import type { AbilityOrderStatsGameModeEnum } from "deadlock_api_client";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Dayjs } from "~/dayjs";
import { buildAbilityTrie, getSortedChildren, mergeStreetBrawlRows } from "~/lib/ability-order-utils";
import { assetsApi } from "~/lib/assets-api";
import { abilityOrderQueryOptions } from "~/queries/ability-order-query";
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
}: AbilityOrderTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [focusedPaths, setFocusedPaths] = useState<Set<string>>(new Set());

  const minDateTimestamp = useMemo(() => minDate?.unix() ?? 0, [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const { data: abilityOrderData, isLoading: isLoadingOrder } = useQuery(
    abilityOrderQueryOptions({
      heroId,
      minRankId,
      maxRankId,
      minDateTimestamp,
      maxDateTimestamp,
      minMatches,
      gameMode,
    }),
  );

  const { data: heroData } = useQuery({
    queryKey: ["assets-hero", heroId],
    queryFn: async () => {
      const response = await assetsApi.heroes_api.getHeroV2HeroesIdGet({ id: heroId });
      return response.data;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const { data: abilityItems } = useQuery({
    queryKey: ["assets-items-abilities"],
    queryFn: async () => {
      const response = await assetsApi.items_api.getItemsByTypeV2ItemsByTypeTypeGet({ type: "ability" });
      return response.data as AbilityV2[];
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

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
  const dragState = useRef({ isDragging: false, didDrag: false, startX: 0, scrollLeft: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    dragState.current = { isDragging: true, didDrag: false, startX: e.clientX, scrollLeft: el.scrollLeft };
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
      <div className="flex items-center justify-center w-full py-16">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!trie || trie.children.size === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">
        No ability order data available for this hero with the selected filters.
      </p>
    );
  }

  const rootChildren = getSortedChildren(trie);
  const focusedRoot = rootChildren.find((child) => focusedPaths.has(String(child.abilityId)));
  const displayedRoots = focusedRoot ? [focusedRoot] : rootChildren;

  return (
    <div
      ref={scrollRef}
      className="overflow-x-auto pb-4 text-center cursor-grab"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onClickCapture={onClickCapture}
    >
      {gameMode === "street_brawl" && (
        <p className="text-sm text-muted-foreground mb-2">
          In Street Brawl, you unlock multiple abilities at once per round. Since the order within each round doesn't
          matter, paths that only differ in that order are shown as one.
        </p>
      )}
      <div className="inline-flex items-start gap-0.5 min-w-max p-4">
        {displayedRoots.map((child) => {
          const childPath = String(child.abilityId);
          return (
            <div key={child.abilityId} className="flex flex-col items-center">
              <AbilityOrderNode
                node={child}
                parentMatches={trie.matches}
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
                siblingCount={displayedRoots.length}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
