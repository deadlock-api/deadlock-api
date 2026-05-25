import { useQuery } from "@tanstack/react-query";
import type { UpgradeV2 } from "assets_deadlock_api_client";
import { memo, useCallback, useMemo, useState } from "react";

import { ItemImage } from "~/components/ItemImage";
import { Button } from "~/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { cn } from "~/lib/utils";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";

type SlotKey = "weapon" | "vitality" | "spirit";
const SLOTS: { key: SlotKey; label: string }[] = [
  { key: "weapon", label: "Weapon" },
  { key: "vitality", label: "Vitality" },
  { key: "spirit", label: "Spirit" },
];
const TIERS = [1, 2, 3, 4] as const;

function setsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

interface ItemCardProps {
  itemId: number;
  included: boolean;
  excluded: boolean;
  onToggleInclude: (id: number) => void;
  onToggleExclude: (id: number) => void;
}

const ItemCard = memo(function ItemCard({
  itemId,
  included,
  excluded,
  onToggleInclude,
  onToggleExclude,
}: ItemCardProps) {
  return (
    <div
      className={cn(
        "relative rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5 transition-colors",
        included && "border-green-500/60 bg-green-500/10",
        excluded && "border-red-500/60 bg-red-500/10",
      )}
    >
      <ItemImage itemId={itemId} className="size-full" />
      <button
        type="button"
        className={cn(
          "absolute bottom-2 left-2 z-10 inline-flex size-5 items-center justify-center rounded-lg text-white shadow ring-1 ring-black/40 transition-colors",
          included ? "bg-green-500/85 hover:bg-green-400" : "bg-green-700/55 hover:bg-green-600/80",
        )}
        onClick={() => onToggleInclude(itemId)}
        aria-label={included ? "Remove from included" : "Include item"}
      >
        <span className="icon-[mdi--plus] size-3.5" />
      </button>
      <button
        type="button"
        className={cn(
          "absolute right-2 bottom-2 z-10 inline-flex size-5 items-center justify-center rounded-lg text-white shadow ring-1 ring-black/40 transition-colors",
          excluded ? "bg-red-500/85 hover:bg-red-400" : "bg-red-700/55 hover:bg-red-600/80",
        )}
        onClick={() => onToggleExclude(itemId)}
        aria-label={excluded ? "Remove from excluded" : "Exclude item"}
      >
        <span className="icon-[mdi--minus] size-3.5" />
      </button>
    </div>
  );
});

interface ItemQuickSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialInclude: Set<number>;
  initialExclude: Set<number>;
  onApply: (include: Set<number>, exclude: Set<number>) => void;
}

export function ItemQuickSelectDialog(props: ItemQuickSelectDialogProps) {
  // Mount the body only while open so each opening re-seeds local state from props
  // (avoids using a setState-in-effect pattern to reset).
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <ItemQuickSelectDialogBody {...props} />}
    </Dialog>
  );
}

function ItemQuickSelectDialogBody({
  onOpenChange,
  initialInclude,
  initialExclude,
  onApply,
}: ItemQuickSelectDialogProps) {
  const { data: assetsItems = [] } = useQuery(itemUpgradesQueryOptions);

  const [stagedInclude, setStagedInclude] = useState<Set<number>>(() => new Set(initialInclude));
  const [stagedExclude, setStagedExclude] = useState<Set<number>>(() => new Set(initialExclude));
  const [slot, setSlot] = useState<SlotKey>("weapon");
  const [search, setSearch] = useState("");

  const isDirty = useMemo(
    () => !setsEqual(stagedInclude, initialInclude) || !setsEqual(stagedExclude, initialExclude),
    [stagedInclude, stagedExclude, initialInclude, initialExclude],
  );

  const shopableItems = useMemo(
    () => assetsItems.filter((i) => !i.disabled && i.shopable && i.shop_image_webp),
    [assetsItems],
  );

  const itemsBySlotAndTier = useMemo(() => {
    const lowerSearch = search.trim().toLowerCase();
    const filtered = lowerSearch
      ? shopableItems.filter((i) => i.name.toLowerCase().includes(lowerSearch))
      : shopableItems;
    const grouped = new Map<SlotKey, Map<number, UpgradeV2[]>>();
    for (const slotKey of SLOTS.map((s) => s.key)) {
      grouped.set(slotKey, new Map(TIERS.map((t) => [t, [] as UpgradeV2[]])));
    }
    for (const item of filtered) {
      const slotMap = grouped.get(item.item_slot_type as SlotKey);
      if (!slotMap) continue;
      const tierList = slotMap.get(item.item_tier as number);
      if (!tierList) continue;
      tierList.push(item);
    }
    for (const slotMap of grouped.values()) {
      for (const tierList of slotMap.values()) {
        tierList.sort((a, b) => a.name.localeCompare(b.name));
      }
    }
    return grouped;
  }, [shopableItems, search]);

  const toggleInclude = useCallback((id: number) => {
    setStagedInclude((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setStagedExclude((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const toggleExclude = useCallback((id: number) => {
    setStagedExclude((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setStagedInclude((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleApply = () => {
    onApply(stagedInclude, stagedExclude);
    onOpenChange(false);
  };

  const handleClearAll = () => {
    setStagedInclude(new Set());
    setStagedExclude(new Set());
  };

  const stagedCount = stagedInclude.size + stagedExclude.size;

  return (
    <DialogContent
      className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-3xl"
      onInteractOutside={(e) => {
        if (isDirty) e.preventDefault();
      }}
      onEscapeKeyDown={(e) => {
        if (isDirty) e.preventDefault();
      }}
    >
      <DialogHeader className="space-y-3 border-b border-white/[0.06] p-4">
        <DialogTitle>Quick Select Items</DialogTitle>
        <Input placeholder="Search items by name..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </DialogHeader>

      <Tabs
        value={slot}
        onValueChange={(v) => {
          setSlot(v as SlotKey);
          setSearch("");
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="mx-4 mt-3 flex h-auto w-auto shrink-0">
          {SLOTS.map((s) => (
            <TabsTrigger key={s.key} value={s.key} className="flex-1">
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {SLOTS.map((s) => {
          const slotMap = itemsBySlotAndTier.get(s.key);
          const slotHasResults = slotMap ? Array.from(slotMap.values()).some((list) => list.length > 0) : false;
          return (
            <TabsContent key={s.key} value={s.key} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {!slotHasResults ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  {search.trim() ? `No items match "${search}".` : "No items available."}
                </p>
              ) : (
                <div className="space-y-4 pt-3">
                  {TIERS.map((tier) => {
                    const items = slotMap?.get(tier) ?? [];
                    if (items.length === 0) return null;
                    return (
                      <div key={tier}>
                        <h4 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                          Tier {tier}
                        </h4>
                        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                          {items.map((item) => (
                            <ItemCard
                              key={item.id}
                              itemId={item.id}
                              included={stagedInclude.has(item.id)}
                              excluded={stagedExclude.has(item.id)}
                              onToggleInclude={toggleInclude}
                              onToggleExclude={toggleExclude}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-white/[0.06] p-4 sm:justify-between">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            <span className="font-medium text-green-400">{stagedInclude.size}</span> included ·{" "}
            <span className="font-medium text-red-400">{stagedExclude.size}</span> excluded
          </span>
          {stagedCount > 0 && (
            <Button type="button" size="xs" variant="ghost" onClick={handleClearAll}>
              Clear all
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <DialogClose asChild>
            <Button type="button" variant="outline" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" size="sm" disabled={!isDirty} onClick={handleApply}>
            Apply
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}
