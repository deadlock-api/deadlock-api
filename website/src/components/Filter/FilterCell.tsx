import { ChevronDownIcon, RotateCcw } from "lucide-react";
import { createContext, useContext } from "react";

import { Segmented, type SegmentedOption } from "~/components/Segmented";
import { Button } from "~/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { cn } from "~/lib/utils";

/** True inside `Filter.Root`, where cells share one border and divide it with hairlines. */
export const FilterRootContext = createContext(false);

const cellBase = "flex min-w-0 flex-col justify-center gap-0.5 px-4 py-2 text-left transition-colors";
const cellInRoot = "grow basis-1/2 border-r border-b md:basis-1/3 lg:min-w-28 lg:shrink-0 lg:basis-auto";
const cellStandalone = "rounded-lg border bg-card";
const activeUnderline = "shadow-[inset_0_-2px_0_0_var(--primary)]";

function CellReset({
  label,
  active,
  onReset,
  className,
}: {
  label: string;
  active?: boolean;
  onReset: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className={cn("disabled:pointer-events-auto", className)}
      aria-label={`Reset ${label.toLowerCase()}`}
      title={`Reset ${label.toLowerCase()}`}
      disabled={!active}
      onClick={onReset}
    >
      <RotateCcw />
    </Button>
  );
}

function CellLabel({
  active,
  children,
  className,
}: {
  active?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "truncate text-[10px] font-semibold tracking-wider uppercase",
        active ? "text-primary" : "text-muted-foreground",
        className,
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
  onReset?: () => void;
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
export function FilterCell({
  label,
  value,
  active,
  onReset,
  icon,
  children,
  className,
  align = "start",
}: FilterCellProps) {
  const inRoot = useContext(FilterRootContext);
  return (
    <Popover>
      <div
        className={cn(
          "grid min-w-0",
          inRoot ? cn(cellInRoot, "relative max-lg:static") : cn(cellStandalone, "relative"),
          active && activeUnderline,
        )}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              cellBase,
              "col-start-1 row-start-1 cursor-pointer outline-none hover:bg-accent focus-visible:bg-accent data-[state=open]:bg-accent",
            )}
          >
            {label && (
              <CellLabel active={active} className={onReset ? "max-w-full pr-5" : undefined}>
                {label}
              </CellLabel>
            )}
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
        {onReset && (
          <CellReset
            label={label}
            active={active}
            onReset={onReset}
            className="col-start-1 row-start-1 mt-0.5 mr-0.5 self-start justify-self-end"
          />
        )}
      </div>
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
  onReset?: () => void;
}

/** A filter with two or three short options, switched in place without a popover. */
export function FilterToggleCell<T extends string>({
  label,
  value,
  onValueChange,
  options,
  active,
  onReset,
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
        "relative",
        inRoot ? cellInRoot : cellStandalone,
        // Long segment rows outgrow a half-width phone cell and a third-width tablet cell.
        inRoot && isWide && "max-md:basis-full md:max-lg:basis-2/3",
        active && activeUnderline,
      )}
    >
      <span className={cn("flex", onReset && "pr-5")}>
        <CellLabel active={active}>{label}</CellLabel>
      </span>
      {onReset && <CellReset label={label} active={active} onReset={onReset} className="absolute top-0.5 right-0.5" />}
      <Segmented
        value={value}
        onValueChange={onValueChange}
        options={options}
        aria-label={label}
        className="w-fit md:flex-nowrap"
      />
    </div>
  );
}
