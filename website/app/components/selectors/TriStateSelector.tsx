import { CircleMinus, CirclePlus, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";

export type TriState = "included" | "excluded";

export interface TriStateOption {
  id: number;
  label: string;
  icon?: ReactNode;
}

export function TriStateSelector({
  options,
  selections,
  onSelectionsChange,
  placeholder,
  label,
}: {
  options: TriStateOption[];
  selections: Map<number, TriState>;
  onSelectionsChange: (selections: Map<number, TriState>) => void;
  placeholder?: string;
  label?: string;
}) {
  const includedItems = options.filter((o) => selections.get(o.id) === "included");
  const excludedItems = options.filter((o) => selections.get(o.id) === "excluded");
  const hasSelections = selections.size > 0;

  function toggleState(id: number, target: TriState) {
    const next = new Map(selections);
    if (selections.get(id) === target) {
      next.delete(id);
    } else {
      next.set(id, target);
    }
    onSelectionsChange(next);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <div className="flex justify-center md:justify-start items-center h-8">
          <span className="text-sm font-semibold text-foreground">{label}</span>
        </div>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-fit min-w-[150px] max-w-[300px] overflow-hidden max-h-20 min-h-9 h-min p-1 box-border"
          >
            <div className="flex flex-wrap gap-1 items-center justify-start">
              {!hasSelections ? (
                <span className="truncate text-muted-foreground px-1">{placeholder || "Select..."}</span>
              ) : (
                <>
                  {includedItems.slice(0, 3).map((item) => (
                    <span
                      key={item.id}
                      className="flex items-center gap-1 bg-green-500/15 text-green-400 border border-green-500/30 rounded px-1 p-0.5"
                    >
                      {item.icon}
                      <span className="truncate text-xs">{item.label}</span>
                    </span>
                  ))}
                  {includedItems.length > 3 && (
                    <span className="text-xs text-green-400">+{includedItems.length - 3}</span>
                  )}
                  {excludedItems.slice(0, 3).map((item) => (
                    <span
                      key={item.id}
                      className="flex items-center gap-1 bg-red-500/15 text-red-400 border border-red-500/30 rounded px-1 p-0.5"
                    >
                      {item.icon}
                      <span className="truncate text-xs">{item.label}</span>
                    </span>
                  ))}
                  {excludedItems.length > 3 && (
                    <span className="text-xs text-red-400">+{excludedItems.length - 3}</span>
                  )}
                </>
              )}
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] max-h-[400px] overflow-y-auto p-0">
          {hasSelections && (
            <div className="sticky top-0 z-10 flex items-center justify-end px-2 py-1.5 border-b bg-popover">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                onClick={() => onSelectionsChange(new Map())}
              >
                Clear all
                <X className="size-3" />
              </button>
            </div>
          )}
          <div className="flex flex-col gap-0.5 p-2">
            {options.map((option) => {
              const state = selections.get(option.id);
              return (
                <div key={option.id} className="flex items-center gap-2 px-2 py-1 hover:bg-accent rounded-sm">
                  <button
                    type="button"
                    className={`shrink-0 rounded-sm p-0.5 transition-colors ${
                      state === "included"
                        ? "bg-green-500/20 text-green-400"
                        : "text-muted-foreground/40 hover:text-green-400 hover:bg-green-500/10"
                    }`}
                    onClick={() => toggleState(option.id, "included")}
                  >
                    <CirclePlus className="size-4" />
                  </button>
                  <button
                    type="button"
                    className={`shrink-0 rounded-sm p-0.5 transition-colors ${
                      state === "excluded"
                        ? "bg-red-500/20 text-red-400"
                        : "text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10"
                    }`}
                    onClick={() => toggleState(option.id, "excluded")}
                  >
                    <CircleMinus className="size-4" />
                  </button>
                  {option.icon && <span className="shrink-0">{option.icon}</span>}
                  <span className="truncate text-sm">{option.label}</span>
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
