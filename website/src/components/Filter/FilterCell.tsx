import { ChevronDownIcon } from "lucide-react";
import { createContext, useContext } from "react";

import { Segmented, type SegmentedOption } from "~/components/Segmented";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { cn } from "~/lib/utils";

/** True inside `Filter.Root`, where cells share one border and divide it with hairlines. */
export const FilterRootContext = createContext(false);

const cellBase = "flex min-w-0 flex-col justify-center gap-0.5 px-4 py-2 text-left transition-colors";
const cellInRoot = "grow basis-1/2 border-r border-b md:basis-1/3 lg:min-w-28 lg:shrink-0 lg:basis-auto";
const cellStandalone = "rounded-lg border bg-card";
const activeUnderline = "shadow-[inset_0_-2px_0_0_var(--primary)]";

function CellLabel({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "truncate text-[10px] font-semibold tracking-wider uppercase",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

interface FilterCellProps {
  label: string;
  value?: string;
  active?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
}

/**
 * A filter trigger that opens its editor in a popover. Inside `Filter.Root` the popover is anchored
 * to the cell on desktop and spans the whole bar on smaller screens; the width is read back through
 * `--radix-popover-trigger-width`, which Radix derives from the anchor.
 */
export function FilterCell({ label, value, active, icon, children, className, align = "start" }: FilterCellProps) {
  const inRoot = useContext(FilterRootContext);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            cellBase,
            "cursor-pointer outline-none hover:bg-accent focus-visible:bg-accent data-[state=open]:bg-accent",
            // Static below lg so the anchor's absolute box resolves against the bar, not the cell.
            inRoot ? cn(cellInRoot, "relative max-lg:static") : cn(cellStandalone, "relative"),
            active && activeUnderline,
          )}
        >
          {label && <CellLabel active={active}>{label}</CellLabel>}
          <span
            className={cn(
              "flex min-w-0 items-center gap-1.5 text-sm font-medium whitespace-nowrap",
              active ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {icon}
            <span className="truncate">{value ?? label}</span>
            <ChevronDownIcon className="size-3.5 shrink-0 opacity-50" />
          </span>
          {inRoot && (
            <PopoverAnchor asChild>
              <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-0" />
            </PopoverAnchor>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={6}
        className={cn("p-2", inRoot && "max-lg:w-(--radix-popover-trigger-width)", className)}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

interface FilterToggleCellProps<T extends string> {
  label: string;
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  active?: boolean;
}

/** A filter with two or three short options, switched in place without a popover. */
export function FilterToggleCell<T extends string>({
  label,
  value,
  onValueChange,
  options,
  active,
}: FilterToggleCellProps<T>) {
  const inRoot = useContext(FilterRootContext);
  const labelLength = options.reduce(
    (length, option) => length + (typeof option.label === "string" ? option.label.length : 0),
    0,
  );
  const isWide = options.length > 3 || labelLength > 10;
  return (
    <div
      className={cn(
        cellBase,
        inRoot ? cellInRoot : cellStandalone,
        // Long segment rows outgrow a half-width phone cell and a third-width tablet cell.
        inRoot && isWide && "max-md:basis-full md:max-lg:basis-2/3",
        active && activeUnderline,
      )}
    >
      <CellLabel active={active}>{label}</CellLabel>
      <Segmented value={value} onValueChange={onValueChange} options={options} className="w-fit md:flex-nowrap" />
    </div>
  );
}
