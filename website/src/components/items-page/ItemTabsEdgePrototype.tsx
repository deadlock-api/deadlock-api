// Throwaway /items variant I: quiet text tabs attached to the table's upper edge.
import { Tabs } from "radix-ui";

const tabs = [
  ["item-stats", "Item Stats"],
  ["item-purchase-analysis", "Purchase Analysis"],
  ["build-flow", "Build Flow"],
  ["item-combos", "Item Combos"],
] as const;

export function ItemTabsEdgePrototype() {
  return (
    <div className="-mx-4 -mb-2 sm:-mx-6">
      <Tabs.List aria-label="Item analytics" className="flex overflow-x-auto border-b border-white/10 pt-1">
        {tabs.map(([value, label]) => (
          <Tabs.Trigger
            key={value}
            value={value}
            className="group relative shrink-0 border-t-2 border-transparent px-4 py-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors duration-150 hover:bg-white/[0.025] hover:text-foreground focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary data-[state=active]:border-primary data-[state=active]:bg-white/[0.035] data-[state=active]:text-foreground motion-reduce:transition-none sm:px-6"
          >
            <span
              aria-hidden="true"
              className="absolute inset-y-2 right-0 w-px bg-white/[0.06] group-last:hidden group-data-[state=active]:bg-transparent"
            />
            {label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </div>
  );
}
