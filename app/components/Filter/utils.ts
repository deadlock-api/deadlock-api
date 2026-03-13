import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { getRankLabel } from "~/lib/rank-utils";
import { ranksQueryOptions } from "~/queries/ranks-query";

/**
 * Format a game mode into a readable string.
 */
export function formatGameMode(gameMode: string | null | undefined): string | null {
  if (!gameMode || gameMode === "normal") return "Ranked";
  if (gameMode === "street_brawl") return "Street Brawl";
  return gameMode;
}

/**
 * Hook that returns a rank label formatter using the cached ranks data.
 */
export function useRankLabel() {
  const { data: ranks } = useQuery(ranksQueryOptions);

  const rankMap = useMemo(() => {
    if (!ranks) return null;
    const map = new Map<number, string>();
    for (const rank of ranks) {
      if (rank.tier === 0) {
        map.set(0, getRankLabel(rank, 1));
      } else {
        for (let sub = 1; sub <= 6; sub++) {
          map.set(rank.tier * 10 + sub, getRankLabel(rank, sub));
        }
      }
    }
    return map;
  }, [ranks]);

  return useCallback(
    (rankId: number | null | undefined): string | null => {
      if (rankId == null || !rankMap) return null;
      return rankMap.get(rankId) ?? null;
    },
    [rankMap],
  );
}

/**
 * Format a rank range into a readable string like "above Phantom 1",
 * "below Eternus 6", or "Phantom 1 - Eternus 6".
 */
export function formatRankRange(
  minRankId: number | null | undefined,
  maxRankId: number | null | undefined,
  labelFn: (rankId: number | null | undefined) => string | null,
  opts?: { defaultMin?: number; defaultMax?: number },
): string | null {
  const isDefaultMin = minRankId == null || minRankId === opts?.defaultMin;
  const isDefaultMax = maxRankId == null || maxRankId === opts?.defaultMax;
  if (isDefaultMin && isDefaultMax) return null;

  const minLabel = labelFn(minRankId);
  const maxLabel = labelFn(maxRankId);

  if (!minLabel && !maxLabel) return null;
  if (minLabel && maxLabel) {
    if (minRankId === maxRankId) return minLabel;
    if (isDefaultMin) return `below ${maxLabel}`;
    if (isDefaultMax) return `above ${minLabel}`;
    return `${minLabel} - ${maxLabel}`;
  }
  if (minLabel) return `above ${minLabel}`;
  if (maxLabel) return `below ${maxLabel}`;
  return null;
}

/**
 * Format seconds into a human-readable time like "5m - 30m" or "after 15m".
 */
export function formatTimeRange(
  minSeconds: number | null | undefined,
  maxSeconds: number | null | undefined,
  defaultMin?: number,
  defaultMax?: number,
): string | null {
  const isDefaultMin = minSeconds == null || minSeconds === defaultMin;
  const isDefaultMax = maxSeconds == null || maxSeconds === defaultMax;
  if (isDefaultMin && isDefaultMax) return null;

  const fmtTime = (s: number) => `${Math.floor(s / 60)}m`;

  if (!isDefaultMin && !isDefaultMax && minSeconds != null && maxSeconds != null)
    return `${fmtTime(minSeconds)} - ${fmtTime(maxSeconds)}`;
  if (!isDefaultMin && minSeconds != null) return `after ${fmtTime(minSeconds)}`;
  if (!isDefaultMax && maxSeconds != null) return `before ${fmtTime(maxSeconds)}`;
  return null;
}
