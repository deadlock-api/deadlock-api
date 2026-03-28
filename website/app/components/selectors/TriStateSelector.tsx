import { CircleMinus, CirclePlus, X } from "lucide-react";
import type { ReactNode } from "react";

import { FilterPill } from "~/components/FilterPill";

export type TriState = "included" | "excluded";

export interface TriStateOption {
  id: number;
  label: string;
  icon?: ReactNode;
  group?: string;
}

export interface TriStateGroupStyle {
  label: string;
  color: string;
}

export interface TriStateColumnLayout {
  superGroups: { key: string; label: string }[];
  columns: { key: string; label: string; color: string }[];
}

function TriStateRow({
  option,
  state,
  onToggle,
}: {
  option: TriStateOption;
  state: TriState | undefined;
  onToggle: (id: number, target: TriState) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent">
      <button
        type="button"
        className={`shrink-0 rounded-sm p-0.5 transition-colors ${
          state === "included"
            ? "bg-green-500/20 text-green-400"
            : "text-muted-foreground/40 hover:bg-green-500/10 hover:text-green-400"
        }`}
        onClick={() => onToggle(option.id, "included")}
      >
        <CirclePlus className="size-4" />
      </button>
      <button
        type="button"
        className={`shrink-0 rounded-sm p-0.5 transition-colors ${
          state === "excluded"
            ? "bg-red-500/20 text-red-400"
            : "text-muted-foreground/40 hover:bg-red-500/10 hover:text-red-400"
        }`}
        onClick={() => onToggle(option.id, "excluded")}
      >
        <CircleMinus className="size-4" />
      </button>
      {option.icon && <span className="shrink-0">{option.icon}</span>}
      <span className="truncate text-sm">{option.label}</span>
    </div>
  );
}

function TriStateColumnContent({
  options,
  selections,
  columnLayout,
  onToggle,
}: {
  options: TriStateOption[];
  selections: Map<number, TriState>;
  columnLayout: TriStateColumnLayout;
  onToggle: (id: number, target: TriState) => void;
}) {
  const grouped = new Map<string, TriStateOption[]>();
  for (const option of options) {
    const key = option.group || "";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(option);
  }

  return (
    <div className="p-2">
      {columnLayout.superGroups.map((sg) => (
        <div key={sg.key} className="mb-3 last:mb-0">
          <div className="px-1 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {sg.label}
          </div>
          <div className="grid grid-cols-1 gap-x-3 xl:grid-cols-3">
            {columnLayout.columns.map((col) => {
              const groupKey = `${sg.key}-${col.key}`;
              const items = grouped.get(groupKey) || [];
              return (
                <div key={col.key}>
                  <div className="px-2 py-1 text-xs font-semibold tracking-wide uppercase" style={{ color: col.color }}>
                    {col.label}
                  </div>
                  {items.map((option) => (
                    <TriStateRow
                      key={option.id}
                      option={option}
                      state={selections.get(option.id)}
                      onToggle={onToggle}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function buildPillValue(includedItems: TriStateOption[], excludedItems: TriStateOption[]): string | undefined {
  if (includedItems.length === 0 && excludedItems.length === 0) return "Any";
  const parts: string[] = [];
  if (includedItems.length > 0) {
    parts.push(`+${includedItems.length}`);
  }
  if (excludedItems.length > 0) {
    parts.push(`-${excludedItems.length}`);
  }
  return parts.join(" / ");
}

function buildPillIcon(includedItems: TriStateOption[], excludedItems: TriStateOption[]): ReactNode | undefined {
  const first = includedItems[0] || excludedItems[0];
  return first?.icon;
}

export function TriStateSelector({
  options,
  selections,
  onSelectionsChange,
  label,
  groupStyles,
  columnLayout,
}: {
  options: TriStateOption[];
  selections: Map<number, TriState>;
  onSelectionsChange: (selections: Map<number, TriState>) => void;
  placeholder?: string;
  label?: string;
  groupStyles?: Record<string, TriStateGroupStyle>;
  columnLayout?: TriStateColumnLayout;
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
    <FilterPill
      label={label || "Items"}
      value={buildPillValue(includedItems, excludedItems)}
      active={hasSelections}
      icon={buildPillIcon(includedItems, excludedItems)}
      className={`max-h-[400px] overflow-y-auto p-0 ${columnLayout ? "w-fit xl:w-fit" : "w-[260px]"}`}
    >
      {hasSelections && (
        <div className="sticky top-0 z-10 flex items-center justify-end border-b bg-popover px-2 py-1.5">
          <button
            type="button"
            className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onSelectionsChange(new Map())}
          >
            Clear all
            <X className="size-3" />
          </button>
        </div>
      )}
      {columnLayout ? (
        <TriStateColumnContent
          options={options}
          selections={selections}
          columnLayout={columnLayout}
          onToggle={toggleState}
        />
      ) : (
        <div className="flex flex-col gap-0.5 p-2">
          {groupStyles
            ? (() => {
                const groups = new Map<string, TriStateOption[]>();
                for (const option of options) {
                  const key = option.group || "";
                  if (!groups.has(key)) groups.set(key, []);
                  groups.get(key)!.push(option);
                }
                return [...groups.entries()].map(([groupKey, groupOptions]) => {
                  const style = groupStyles[groupKey];
                  return (
                    <div key={groupKey}>
                      {style && (
                        <div
                          className="mt-1 px-2 py-1.5 text-xs font-semibold tracking-wide uppercase first:mt-0"
                          style={{ color: style.color }}
                        >
                          {style.label}
                        </div>
                      )}
                      {groupOptions.map((option) => (
                        <TriStateRow
                          key={option.id}
                          option={option}
                          state={selections.get(option.id)}
                          onToggle={toggleState}
                        />
                      ))}
                    </div>
                  );
                });
              })()
            : options.map((option) => (
                <TriStateRow key={option.id} option={option} state={selections.get(option.id)} onToggle={toggleState} />
              ))}
        </div>
      )}
    </FilterPill>
  );
}
