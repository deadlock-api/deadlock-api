import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AnalyticsApiItemStatsRequest, Upgrade } from "deadlock_api_client";
import { useMemo, useState } from "react";

import { ItemImage } from "~/components/ItemImage";
import { ItemName } from "~/components/ItemName";
import { ItemBuyTimingChart } from "~/components/items-page/ItemBuyTimingChart";
import { LoadingLogo } from "~/components/LoadingLogo";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "~/components/ui/sheet";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import {
  analyzePurchaseWindows,
  calculateTierHorizons,
  formatPurchaseWindow,
  formatPurchaseWindows,
  type PurchaseBucketRow,
  type PurchaseWindow,
} from "~/lib/purchase-guide";
import { cn } from "~/lib/utils";
import { wilsonScoreInterval } from "~/lib/wilson";
import { filterShopableItems, itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";

export type PurchaseGuideSort = "pick_rate" | "best_window";

interface GuideItem {
  itemId: number;
  name: string;
  tier: number;
  slotType: Upgrade["item_slot_type"];
  overallMatches: number;
  overallWinRate: number;
  overallWilsonLowerBound: number;
  relativePickRate: number;
  windows: PurchaseWindow[];
}

const TIERS = [
  { value: 1, label: "I" },
  { value: 2, label: "II" },
  { value: 3, label: "III" },
  { value: 4, label: "IV" },
] as const;

function strongestWindow(item: GuideItem): PurchaseWindow | undefined {
  return item.windows.reduce<PurchaseWindow | undefined>(
    (best, window) =>
      !best ||
      window.wilsonLowerBound > best.wilsonLowerBound ||
      (window.wilsonLowerBound === best.wilsonLowerBound && window.matches > best.matches)
        ? window
        : best,
    undefined,
  );
}

function compareGuideItems(a: GuideItem, b: GuideItem, sort: PurchaseGuideSort): number {
  if (sort === "best_window") {
    const aWindow = strongestWindow(a);
    const bWindow = strongestWindow(b);
    const byWindow = (bWindow?.wilsonLowerBound ?? -1) - (aWindow?.wilsonLowerBound ?? -1);
    if (byWindow !== 0) return byWindow;
    const byWindowMatches = (bWindow?.matches ?? 0) - (aWindow?.matches ?? 0);
    if (byWindowMatches !== 0) return byWindowMatches;
  }

  return (
    b.relativePickRate - a.relativePickRate ||
    b.overallWilsonLowerBound - a.overallWilsonLowerBound ||
    b.overallMatches - a.overallMatches ||
    a.name.localeCompare(b.name)
  );
}

function slotColor(slotType: Upgrade["item_slot_type"]) {
  switch (slotType) {
    case "weapon":
      return "border-orange-400/35 bg-orange-400/10 hover:bg-orange-400/20";
    case "vitality":
      return "border-lime-400/35 bg-lime-400/10 hover:bg-lime-400/20";
    case "spirit":
      return "border-fuchsia-400/35 bg-fuchsia-400/10 hover:bg-fuchsia-400/20";
    default:
      return "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]";
  }
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function WindowEvidence({ window }: { window: PurchaseWindow }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
      <p className="text-sm font-semibold">{formatPurchaseWindows([window])}</p>
      <dl className="mt-2 grid grid-cols-3 gap-3 text-xs">
        <div>
          <dt className="text-muted-foreground">Win rate</dt>
          <dd className="mt-0.5 font-mono font-medium">{percent(window.trueWinRate)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Conservative</dt>
          <dd className="mt-0.5 font-mono font-medium">{percent(window.wilsonLowerBound)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Matches</dt>
          <dd className="mt-0.5 font-mono font-medium">{window.matches.toLocaleString()}</dd>
        </div>
      </dl>
    </div>
  );
}

function GuideItemCard({ item, onSelect }: { item: GuideItem; onSelect: (itemId: number) => void }) {
  const rangeLabel = formatPurchaseWindows(item.windows);

  return (
    <button
      type="button"
      onClick={() => onSelect(item.itemId)}
      aria-label={`${item.name}: ${rangeLabel}`}
      className={cn(
        "group flex w-24 shrink-0 flex-col items-center rounded-md border px-2 py-2 text-center shadow-sm transition",
        "focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
        slotColor(item.slotType),
      )}
    >
      <ItemImage itemId={item.itemId} className="size-12 rounded-sm" />
      <span className="mt-1.5 flex min-h-7 flex-col justify-center font-mono text-[11px] leading-tight font-bold text-foreground">
        {item.windows.length > 0
          ? item.windows.map((window) => (
              <span key={`${window.bucketStart}-${window.bucketEnd}`}>{formatPurchaseWindow(window)}</span>
            ))
          : "No data"}
      </span>
      <ItemName itemId={item.itemId} className="mt-1 w-full text-[10px] leading-tight text-muted-foreground" />
    </button>
  );
}

export function PurchaseGuide({
  minRankId,
  maxRankId,
  minDate,
  maxDate,
  hero,
  minMatches,
  gameMode,
  sort,
}: {
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  hero?: number | null;
  minMatches?: number | null;
  gameMode?: GameMode;
  sort: PurchaseGuideSort;
}) {
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);

  const baseQueryOptions: Omit<AnalyticsApiItemStatsRequest, "bucket"> = useMemo(
    () => ({
      minMatches,
      heroId: hero,
      minAverageBadge: minRankId,
      maxAverageBadge: maxRankId,
      minUnixTimestamp: minUnixTimestamp ?? 0,
      maxUnixTimestamp,
      gameMode,
    }),
    [minMatches, hero, minRankId, maxRankId, minUnixTimestamp, maxUnixTimestamp, gameMode],
  );

  const { data: assets = [], isLoading: isLoadingAssets } = useQuery(itemUpgradesQueryOptions);
  const {
    data: overallStats = [],
    isLoading: isLoadingOverall,
    isPlaceholderData: isRefreshingOverall,
    error: overallError,
  } = useQuery({
    ...itemStatsQueryOptions(baseQueryOptions),
    placeholderData: keepPreviousData,
  });
  const {
    data: bucketStats = [],
    isLoading: isLoadingBuckets,
    isPlaceholderData: isRefreshingBuckets,
    error: bucketError,
  } = useQuery({
    ...itemStatsQueryOptions({ ...baseQueryOptions, bucket: "net_worth_by_1000", minMatches: 2 }),
    placeholderData: keepPreviousData,
  });

  const guideItems = useMemo(() => {
    const shopableAssets = filterShopableItems(assets).filter(
      (item) => item.item_tier != null && item.item_tier >= 1 && item.item_tier <= 4,
    );
    const assetById = new Map(shopableAssets.map((item) => [item.id, item]));
    const bucketRowsByItem = new Map<number, PurchaseBucketRow[]>();

    for (const row of bucketStats) {
      if (!assetById.has(row.item_id)) continue;
      const rows = bucketRowsByItem.get(row.item_id) ?? [];
      rows.push({ bucket: row.bucket, matches: row.matches, wins: row.wins });
      bucketRowsByItem.set(row.item_id, rows);
    }

    const horizons = calculateTierHorizons(
      shopableAssets.map((item) => ({
        tier: item.item_tier ?? 0,
        buckets: bucketRowsByItem.get(item.id) ?? [],
      })),
    );

    const eligibleStats = overallStats.filter((row) => assetById.has(row.item_id));
    const maxMatches = Math.max(1, ...eligibleStats.map((row) => row.matches));

    return eligibleStats.map((row): GuideItem => {
      const asset = assetById.get(row.item_id)!;
      const tier = asset.item_tier ?? 0;
      const windows = analyzePurchaseWindows(
        bucketRowsByItem.get(row.item_id) ?? [],
        row.matches,
        horizons.get(tier) ?? Number.POSITIVE_INFINITY,
      );
      const [overallWilsonLowerBound] = wilsonScoreInterval(row.wins, row.matches);

      return {
        itemId: row.item_id,
        name: asset.name ?? "Unknown Item",
        tier,
        slotType: asset.item_slot_type,
        overallMatches: row.matches,
        overallWinRate: row.wins / row.matches,
        overallWilsonLowerBound,
        relativePickRate: row.matches / maxMatches,
        windows,
      };
    });
  }, [assets, bucketStats, overallStats]);

  const itemsByTier = useMemo(() => {
    const result = new Map<number, GuideItem[]>();
    for (const { value } of TIERS) {
      result.set(
        value,
        guideItems
          .filter((item) => item.tier === value)
          .sort((a, b) => compareGuideItems(a, b, sort))
          .slice(0, 8),
      );
    }
    return result;
  }, [guideItems, sort]);

  const selectedItem = guideItems.find((item) => item.itemId === selectedItemId);
  const isInitialLoading = isLoadingAssets || isLoadingOverall || isLoadingBuckets;
  const isRefreshing = isRefreshingOverall || isRefreshingBuckets;
  const error = overallError ?? bucketError;

  if (isInitialLoading) {
    return (
      <div className="flex min-h-80 items-center justify-center">
        <LoadingLogo />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-10 text-center">
        <p className="font-medium text-destructive">Purchase guide data could not be loaded.</p>
        <p className="mt-1 text-sm text-muted-foreground">Try changing the filters or refreshing the page.</p>
      </div>
    );
  }

  return (
    <>
      <div className={cn("space-y-3 transition-opacity", isRefreshing && "opacity-60")}>
        {TIERS.map((tier) => {
          const items = itemsByTier.get(tier.value) ?? [];
          return (
            <section
              key={tier.value}
              aria-labelledby={`purchase-guide-tier-${tier.value}`}
              className="flex min-h-28 items-stretch overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.025]"
            >
              <div className="flex w-16 shrink-0 items-center justify-center border-r border-white/[0.08] bg-white/[0.025]">
                <h2
                  id={`purchase-guide-tier-${tier.value}`}
                  className="font-mono text-xl font-bold tracking-wider text-muted-foreground"
                >
                  {tier.label}
                </h2>
              </div>
              <div className="min-w-0 flex-1 overflow-x-auto p-3">
                {items.length > 0 ? (
                  <div className="flex min-w-max gap-2">
                    {items.map((item) => (
                      <GuideItemCard key={item.itemId} item={item} onSelect={setSelectedItemId} />
                    ))}
                  </div>
                ) : (
                  <div className="flex h-full min-h-20 items-center justify-center text-sm text-muted-foreground">
                    No items meet these filters.
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <Sheet open={selectedItem != null} onOpenChange={(open) => !open && setSelectedItemId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-5xl">
          {selectedItem && (
            <>
              <SheetHeader className="border-b border-white/[0.08] pr-12">
                <div className="flex items-center gap-3">
                  <ItemImage itemId={selectedItem.itemId} className="size-12 rounded-sm" />
                  <div>
                    <SheetTitle>{selectedItem.name}</SheetTitle>
                    <SheetDescription>
                      Tier {TIERS.find((tier) => tier.value === selectedItem.tier)?.label} purchase evidence
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="space-y-5 px-4 pb-6">
                <dl className="grid grid-cols-3 gap-3 rounded-lg border border-white/[0.08] bg-white/[0.025] p-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Overall win rate</dt>
                    <dd className="mt-0.5 font-mono font-semibold">{percent(selectedItem.overallWinRate)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Conservative</dt>
                    <dd className="mt-0.5 font-mono font-semibold">{percent(selectedItem.overallWilsonLowerBound)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Pick Rate</dt>
                    <dd className="mt-0.5 font-mono font-semibold">{percent(selectedItem.relativePickRate)}</dd>
                  </div>
                </dl>

                <div>
                  <h3 className="mb-2 text-sm font-semibold">Recommended net-worth windows</h3>
                  {selectedItem.windows.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {selectedItem.windows.map((window) => (
                        <WindowEvidence key={`${window.bucketStart}-${window.bucketEnd}`} window={window} />
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-3 text-sm text-muted-foreground">
                      No window has enough evidence under the current filters.
                    </p>
                  )}
                </div>

                <ItemBuyTimingChart
                  itemIds={[selectedItem.itemId]}
                  baseQueryOptions={baseQueryOptions}
                  rowTotalMatches={selectedItem.overallMatches}
                />

                <p className="text-xs leading-relaxed text-muted-foreground">
                  These are observational results. A high win rate at a purchase window does not prove that buying the
                  item then caused the win.
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
