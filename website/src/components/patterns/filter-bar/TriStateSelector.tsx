import { CircleMinus, CirclePlus } from "lucide-react";
import { createContext, type ReactNode, use } from "react";

import { FilterCell, type FilterCellPassthroughProps } from "~/components/patterns/filter-bar/FilterCell";
import { Button } from "~/components/ui/button";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { cn } from "~/lib/utils";

export type TriState = "included" | "excluded";
type TriStateValue = Map<number, TriState>;

const NO_SELECTIONS: TriStateValue = new Map();

const TriStateContext = createContext<{
  value: TriStateValue;
  toggle: (id: number, target: TriState) => void;
} | null>(null);

/** One entry that can be included, excluded or left alone. The pressed button carries the state, not only its color. */
export function TriStateItem({
  value: id,
  label,
  icon,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  value: number;
  label: string;
  icon?: ReactNode;
}) {
  const context = use(TriStateContext);
  if (!context) throw new Error("TriStateItem must be used inside a TriStateSelector");
  const state = context.value.get(id);
  return (
    <div
      data-slot="tri-state-item"
      data-state={state ?? "neutral"}
      className={cn("flex items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent", className)}
      {...props}
    >
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Include ${label}`}
        aria-pressed={state === "included"}
        className={cn(
          "rounded-sm",
          state === "included"
            ? "bg-positive/20 text-positive hover:bg-positive/20 hover:text-positive"
            : "text-muted-foreground hover:bg-positive/10 hover:text-positive",
        )}
        onClick={() => context.toggle(id, "included")}
      >
        <CirclePlus className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Exclude ${label}`}
        aria-pressed={state === "excluded"}
        className={cn(
          "rounded-sm",
          state === "excluded"
            ? "bg-negative/20 text-negative hover:bg-negative/20 hover:text-negative"
            : "text-muted-foreground hover:bg-negative/10 hover:text-negative",
        )}
        onClick={() => context.toggle(id, "excluded")}
      >
        <CircleMinus className="size-4" />
      </Button>
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate text-sm">{label}</span>
    </div>
  );
}

/** A titled run of `TriStateItem`s. `color` comes from data: the category the group stands for. */
export function TriStateGroup({
  label,
  color,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"section">, "color"> & { label: string; color?: string }) {
  return (
    <section
      data-slot="tri-state-group"
      aria-label={label}
      className={cn("flex min-w-0 flex-col", className)}
      {...props}
    >
      <div className="px-2 py-1 eyebrow text-xs text-foreground" style={color ? { color } : undefined}>
        {label}
      </div>
      {children}
    </section>
  );
}

/** A titled block whose `TriStateGroup`s sit side by side as columns, as many as the popover has room for. */
export function TriStateSection({
  label,
  className,
  children,
  ...props
}: React.ComponentProps<"section"> & { label: string }) {
  return (
    <section
      data-slot="tri-state-section"
      aria-label={label}
      className={cn("flex min-w-0 flex-col", className)}
      {...props}
    >
      <div className="px-1 py-1 eyebrow text-xs">{label}</div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-x-3">{children}</div>
    </section>
  );
}

interface TriStateSelectorProps extends FilterCellPassthroughProps {
  label?: string;
  /** Entry id to included / excluded; an entry that is neither has no key. */
  value?: TriStateValue;
  defaultValue?: TriStateValue;
  onValueChange?: (value: TriStateValue) => void;
  /** `wide` has room for a `TriStateSection` to lay three groups side by side. */
  width?: "default" | "wide";
  /** `TriStateItem`s, grouped by `TriStateGroup` and `TriStateSection` where the list is long. */
  children?: ReactNode;
}

function countLabel(value: TriStateValue) {
  let included = 0;
  for (const state of value.values()) if (state === "included") included++;
  const excluded = value.size - included;
  if (value.size === 0) return "Any";
  return [included > 0 && `+${included}`, excluded > 0 && `-${excluded}`].filter(Boolean).join(" / ");
}

/** A filter of many entries, each included, excluded or left alone. */
export function TriStateSelector({
  label = "Items",
  value: valueProp,
  defaultValue = NO_SELECTIONS,
  onValueChange,
  width = "default",
  icon,
  contentClassName,
  children,
  ...props
}: TriStateSelectorProps) {
  const [value, setValue] = useControllableState({
    value: valueProp,
    defaultValue,
    onValueChange,
  });

  function toggle(id: number, target: TriState) {
    const next = new Map(value);
    if (value.get(id) === target) next.delete(id);
    else next.set(id, target);
    setValue(next);
  }

  return (
    <FilterCell
      label={label}
      value={countLabel(value)}
      active={value.size > 0}
      onReset={() => setValue(new Map())}
      icon={icon}
      contentClassName={cn(
        "max-h-100 max-w-(--radix-popover-content-available-width) overflow-auto p-2",
        width === "wide" ? "w-160" : "w-64",
        contentClassName,
      )}
      {...props}
    >
      <TriStateContext value={{ value, toggle }}>
        <div data-slot="tri-state-list" className={cn("flex flex-col", width === "wide" ? "gap-3" : "gap-0.5")}>
          {children}
        </div>
      </TriStateContext>
    </FilterCell>
  );
}
