import { useQuery } from "@tanstack/react-query";
import type { Upgrade } from "deadlock_api_client";
import { memo, useCallback, useMemo, useState } from "react";

import { ItemImage } from "~/components/domain/assets/ItemImage";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { Box } from "~/components/ui/box";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Heading } from "~/components/ui/heading";
import { SearchInput } from "~/components/ui/search-input";
import { Separator } from "~/components/ui/separator";
import { Stack } from "~/components/ui/stack";
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

const CORNER_TOGGLE = "absolute bottom-1.5 z-10";

interface ItemCardProps {
  item: Upgrade;
  included: boolean;
  excluded: boolean;
  onToggleInclude: (id: number) => void;
  onToggleExclude: (id: number) => void;
}

const ItemCard = memo(function ItemCard({ item, included, excluded, onToggleInclude, onToggleExclude }: ItemCardProps) {
  const tone = included ? "positive" : excluded ? "negative" : "glass";
  return (
    <Card tone={tone} size="xs" className="relative p-1.5">
      <ItemImage item={item} className="size-full" />
      <Button
        variant={included ? "positive-soft" : "subtle"}
        scrim="dark"
        size="icon-xs"
        aria-pressed={included}
        className={cn(CORNER_TOGGLE, "start-1.5")}
        onClick={() => onToggleInclude(item.id)}
        aria-label={included ? `Remove ${item.name} from included` : `Include ${item.name}`}
      >
        <span className="icon-[mdi--plus] size-3.5" />
      </Button>
      <Button
        variant={excluded ? "negative-soft" : "subtle"}
        scrim="dark"
        size="icon-xs"
        aria-pressed={excluded}
        className={cn(CORNER_TOGGLE, "end-1.5")}
        onClick={() => onToggleExclude(item.id)}
        aria-label={excluded ? `Remove ${item.name} from excluded` : `Exclude ${item.name}`}
      >
        <span className="icon-[mdi--minus] size-3.5" />
      </Button>
    </Card>
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
    const grouped = new Map<SlotKey, Map<number, Upgrade[]>>();
    for (const slotKey of SLOTS.map((s) => s.key)) {
      grouped.set(slotKey, new Map(TIERS.map((t) => [t, [] as Upgrade[]])));
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
      className="flex flex-col gap-0 p-0 sm:max-w-3xl"
      onInteractOutside={(e) => {
        if (isDirty) e.preventDefault();
      }}
      onEscapeKeyDown={(e) => {
        if (isDirty) e.preventDefault();
      }}
    >
      <DialogHeader className="gap-3 p-4">
        <DialogTitle>Quick Select Items</DialogTitle>
        <SearchInput
          aria-label="Search items by name"
          placeholder="Search items by name..."
          value={search}
          onValueChange={setSearch}
        />
      </DialogHeader>
      <Separator />

      <Tabs
        value={slot}
        onValueChange={(v) => {
          setSlot(v as SlotKey);
          setSearch("");
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <Box paddingX={4} className="shrink-0 pt-3">
          <TabsList className="flex h-auto w-full">
            {SLOTS.map((s) => (
              <TabsTrigger key={s.key} value={s.key} className="flex-1">
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Box>

        {SLOTS.map((s) => {
          const slotMap = itemsBySlotAndTier.get(s.key);
          const slotHasResults = slotMap ? Array.from(slotMap.values()).some((list) => list.length > 0) : false;
          return (
            <TabsContent key={s.key} value={s.key} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {!slotHasResults ? (
                <EmptyState
                  variant="inline"
                  className="py-12"
                  title={search.trim() ? `No items match "${search}".` : "No items available."}
                />
              ) : (
                <Stack gap={4} className="pt-3">
                  {TIERS.map((tier) => {
                    const items = slotMap?.get(tier) ?? [];
                    if (items.length === 0) return null;
                    return (
                      <Stack key={tier} gap={2}>
                        <Heading as="h4" size="eyebrow">
                          Tier {tier}
                        </Heading>
                        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                          {items.map((item) => (
                            <ItemCard
                              key={item.id}
                              item={item}
                              included={stagedInclude.has(item.id)}
                              excluded={stagedExclude.has(item.id)}
                              onToggleInclude={toggleInclude}
                              onToggleExclude={toggleExclude}
                            />
                          ))}
                        </div>
                      </Stack>
                    );
                  })}
                </Stack>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      <Separator />
      <DialogFooter className="flex-row items-center justify-between gap-2 p-4 sm:justify-between">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            <span className="font-medium text-positive">{stagedInclude.size}</span> included ·{" "}
            <span className="font-medium text-negative">{stagedExclude.size}</span> excluded
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
