// Throwaway tab layouts on /items, switchable with ?variant=A through F.
import { ArrowLeft, ArrowRight, BarChart3, Clock3, GitBranch, Layers } from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { Portal, Tabs } from "radix-ui";
import { useEffect } from "react";

import { cn } from "~/lib/utils";

import { ItemTabsEdgePrototype } from "./ItemTabsEdgePrototype";
import { ItemTabsJoinedPrototype } from "./ItemTabsJoinedPrototype";
import { ItemTabsTextPrototype } from "./ItemTabsTextPrototype";

const variants = ["A", "B", "C", "D", "E", "F", "G", "H", "I"] as const;
const names = {
  A: "Compact segments",
  B: "Explore cards",
  C: "Navigation rail",
  D: "Joined tabs",
  E: "Text bar",
  F: "Square segments",
  G: "Joined folder tabs",
  H: "Quiet text rail",
  I: "Edge tabs",
};
const options = [
  { value: "item-stats", label: "Item Stats", detail: "Compare win rates and item popularity", icon: BarChart3 },
  {
    value: "item-purchase-analysis",
    label: "Purchase Analysis",
    detail: "Find the strongest purchase timings",
    icon: Clock3,
  },
  { value: "build-flow", label: "Build Flow", detail: "Explore how builds progress through a match", icon: GitBranch },
  { value: "item-combos", label: "Item Combos", detail: "Discover items that work well together", icon: Layers },
];

export function ItemTabsPrototype({ value }: { value: string }) {
  const [variant, setVariant] = useQueryState(
    "variant",
    parseAsStringLiteral(variants).withDefault("A").withOptions({ history: "replace" }),
  );
  const cycle = (direction: number) =>
    setVariant(variants[(variants.indexOf(variant) + direction + variants.length) % variants.length]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (
        event.target instanceof Element &&
        event.target.closest('input,textarea,select,[contenteditable],[role="tablist"],[role="slider"]')
      )
        return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        void cycle(event.key === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant, setVariant]);
  const selected = options.find((option) => option.value === value) ?? options[0];
  return (
    <>
      {variant === "G" ? (
        <ItemTabsJoinedPrototype />
      ) : variant === "H" ? (
        <ItemTabsTextPrototype />
      ) : variant === "I" ? (
        <ItemTabsEdgePrototype />
      ) : (
        <div
          className={cn(
            "mb-2",
            (variant === "D" || variant === "F") && "-mx-4 -mb-2 sm:-mx-6",
            variant === "C" &&
              "grid gap-5 rounded-lg border border-white/10 bg-white/[0.02] p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]",
          )}
        >
          <Tabs.List
            aria-label="Item analytics"
            className={cn(
              variant === "A" &&
                "flex w-fit max-w-full flex-wrap gap-1 rounded-xl border border-white/10 bg-black/25 p-1",
              variant === "B" && "grid grid-cols-2 gap-2 xl:grid-cols-4",
              variant === "C" && "grid grid-cols-2 gap-1 sm:grid-cols-1",
              variant === "D" && "flex overflow-x-auto border-b border-white/10 px-3 pt-1",
              variant === "E" && "flex flex-wrap items-center gap-x-6 gap-y-2 py-1",
              variant === "F" && "grid grid-cols-2 border-t border-white/10 sm:grid-cols-4",
            )}
          >
            {options.map(({ value: key, label, detail, icon: Icon }, index) => (
              <Tabs.Trigger
                key={key}
                value={key}
                className={cn(
                  "group min-w-0 text-left text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary data-[state=active]:text-foreground",
                  variant === "A" &&
                    "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium data-[state=active]:bg-primary/15 data-[state=active]:text-primary",
                  variant === "B" &&
                    "rounded-lg border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.04] data-[state=active]:border-primary/60 data-[state=active]:bg-primary/10",
                  variant === "C" &&
                    "flex items-center gap-3 border-l-2 border-transparent px-3 py-2 text-sm data-[state=active]:border-primary data-[state=active]:bg-white/5",
                  variant === "D" &&
                    "relative -mb-px shrink-0 rounded-t-lg border border-transparent px-5 py-3 text-sm data-[state=active]:border-white/10 data-[state=active]:border-b-zinc-900 data-[state=active]:bg-zinc-900",
                  variant === "E" &&
                    "flex items-center gap-2 py-2 text-sm before:size-1.5 before:rounded-full before:bg-transparent data-[state=active]:text-primary data-[state=active]:before:bg-primary",
                  variant === "F" &&
                    "border-r border-b border-white/10 px-3 py-3 text-center text-xs tracking-wide uppercase last:border-r-0 hover:bg-white/5 data-[state=active]:bg-primary data-[state=active]:text-white",
                )}
              >
                {variant === "C" ? (
                  <span className="font-mono text-xs opacity-40">0{index + 1}</span>
                ) : variant === "A" || variant === "B" ? (
                  <Icon
                    aria-hidden="true"
                    className={cn("size-4 shrink-0", variant === "B" && "mb-3 size-5 text-primary")}
                  />
                ) : null}
                <span className="block font-medium">{label}</span>
                {variant === "B" && (
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{detail}</span>
                )}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {variant === "C" && (
            <div className="flex flex-col justify-center border-t border-white/10 pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5">
              <span className="text-[10px] tracking-widest text-primary uppercase">Item analytics</span>
              <div className="mt-2 text-xl font-semibold">{selected.label}</div>
              <p className="mt-1 text-sm text-muted-foreground">{selected.detail}.</p>
            </div>
          )}
        </div>
      )}
      {import.meta.env.DEV && (
        <Portal.Root>
          <div
            aria-label="Design prototype switcher"
            className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/20 bg-zinc-950 px-3 py-2 text-white shadow-2xl"
          >
            <button
              type="button"
              aria-label="Previous design"
              onClick={() => cycle(-1)}
              className="rounded-full p-2 hover:bg-white/10"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div className="min-w-40 text-center">
              <span className="block text-[9px] tracking-widest text-white/40 uppercase">Tabs prototype</span>
              <span className="text-xs">
                {variant} · {names[variant]}
              </span>
            </div>
            <button
              type="button"
              aria-label="Next design"
              onClick={() => cycle(1)}
              className="rounded-full p-2 hover:bg-white/10"
            >
              <ArrowRight className="size-4" />
            </button>
          </div>
        </Portal.Root>
      )}
    </>
  );
}
