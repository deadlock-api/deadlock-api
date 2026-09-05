// Throwaway variant G: compact folder tabs joined directly to the analytics panel.
import { Tabs } from "radix-ui";

const tabs = [
  ["item-stats", "Item Stats"],
  ["item-purchase-analysis", "Purchase Analysis"],
  ["build-flow", "Build Flow"],
  ["item-combos", "Item Combos"],
] as const;

export function ItemTabsJoinedPrototype() {
  return (
    <div className="-mx-4 -mb-2 sm:-mx-6">
      <Tabs.List aria-label="Item analytics" className="flex overflow-x-auto pt-1">
        {tabs.map(([value, label]) => (
          <Tabs.Trigger
            key={value}
            value={value}
            className="relative shrink-0 rounded-t-md border border-transparent border-b-white/10 px-4 py-2.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors duration-150 hover:bg-white/[0.025] hover:text-foreground focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary data-[state=active]:border-white/10 data-[state=active]:border-b-transparent data-[state=active]:bg-white/[0.025] data-[state=active]:text-foreground sm:px-5 motion-reduce:transition-none"
          >
            {label}
          </Tabs.Trigger>
        ))}
        <span aria-hidden="true" className="min-w-3 flex-1 border-b border-white/10" />
      </Tabs.List>
    </div>
  );
}
