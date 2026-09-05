// Throwaway variant H: quiet text navigation with a precise inset selection marker.
import { Tabs } from "radix-ui";

const options = [
  { value: "item-stats", label: "Item Stats" },
  { value: "item-purchase-analysis", label: "Purchase Analysis" },
  { value: "build-flow", label: "Build Flow" },
  { value: "item-combos", label: "Item Combos" },
];

export function ItemTabsTextPrototype() {
  return (
    <div className="-mx-4 -mb-2 border-t border-white/[0.06] bg-white/[0.015] sm:-mx-6">
      <Tabs.List aria-label="Item analytics" className="flex min-w-0 gap-1 overflow-x-auto px-2 sm:gap-3 sm:px-4">
        {options.map(({ value, label }) => (
          <Tabs.Trigger
            key={value}
            value={value}
            className="group relative shrink-0 px-3 py-3.5 text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-primary data-[state=active]:text-foreground motion-reduce:transition-none"
          >
            {label}
            <span
              aria-hidden="true"
              className="absolute inset-x-3 bottom-0 h-0.5 origin-left scale-x-0 bg-primary opacity-0 transition-[transform,opacity] duration-200 ease-out group-data-[state=active]:scale-x-100 group-data-[state=active]:opacity-100 motion-reduce:transition-none"
            />
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </div>
  );
}
