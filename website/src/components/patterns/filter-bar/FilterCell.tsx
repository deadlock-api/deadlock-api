import { ChevronDownIcon, RotateCcw } from "lucide-react";
import { Children, createContext, useContext } from "react";

import { Button } from "~/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Segmented } from "~/components/ui/segmented";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";

/** True inside `Filter.Root`, where cells share one border and divide it with hairlines. */
export const FilterRootContext = createContext(false);

const cellBase = "flex min-w-0 flex-col justify-center gap-0.5 px-4 py-2 text-start transition-colors";
// The bar draws the hairlines as 1px gaps, so the bases leave room for them: two cells across a narrow bar, three
// from `@md`, and as many as fit from `@2xl`. The queries read the width of the `FilterBar`.
const cellInRoot = "grow basis-2/5 bg-card @md:basis-1/4 @2xl:min-w-28 @2xl:shrink-0 @2xl:basis-auto";
const cellStandalone = "rounded-lg border bg-card";
const activeUnderline = "shadow-active-underline";
const CELL_SELECTOR = '[data-slot="filter-cell"], [data-slot="filter-toggle-cell"]';

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
      onClick={(event) => {
        const button = event.currentTarget;
        const cell = button.closest<HTMLElement>(CELL_SELECTOR);
        onReset();
        // Reset removes this button. Keep keyboard focus in the same filter box.
        requestAnimationFrame(() => {
          if (!cell?.isConnected || (document.activeElement !== button && document.activeElement !== document.body))
            return;
          cell
            .querySelector<HTMLElement>('button[data-slot="popover-trigger"], [role="radio"][aria-checked="true"]')
            ?.focus({ preventScroll: true });
        });
      }}
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
    <span data-slot="filter-cell-label" className={cn("truncate eyebrow", active && "text-primary", className)}>
      {children}
    </span>
  );
}

interface FilterCellProps extends Omit<React.ComponentProps<"div">, "children"> {
  label: string;
  /** The current choice in words. Without it the cell repeats its label. */
  value?: string;
  /** The filter differs from its default: the label turns primary, the cell is underlined and the reset shows. */
  active?: boolean;
  onReset?: () => void;
  disabled?: boolean;
  /** The choices are still being fetched: the cell is busy and cannot be opened. */
  loading?: boolean;
  icon?: React.ReactNode;
  /** The editor, shown in the popover. */
  children: React.ReactNode;
  /** Sizes the popover: its width and padding. */
  contentClassName?: string;
  align?: "start" | "center" | "end";
}

/**
 * A filter trigger that opens its editor in a popover. Inside a `FilterBar` the popover is anchored to the cell
 * when the bar is wide and to the whole bar when it is narrow; it is never narrower than its anchor
 * (`--radix-popover-trigger-width`, which Radix derives from the anchor).
 */
export function FilterCell({
  label,
  value,
  active = false,
  onReset,
  disabled = false,
  loading = false,
  icon,
  children,
  contentClassName,
  className,
  align = "start",
  ...props
}: FilterCellProps) {
  const inRoot = useContext(FilterRootContext);
  return (
    <Popover>
      <div
        data-slot="filter-cell"
        data-active={active || undefined}
        data-disabled={disabled || undefined}
        aria-busy={loading || undefined}
        className={cn(
          "grid min-w-0",
          inRoot ? cn(cellInRoot, "static @2xl:relative") : cn(cellStandalone, "relative"),
          active && activeUnderline,
          className,
        )}
        {...props}
      >
        <PopoverTrigger asChild>
          {/* ds-allow raw-button: the cell itself is the trigger; its two-line label/value layout is not a Button */}
          <button
            type="button"
            disabled={disabled || loading}
            className={cn(
              cellBase,
              "col-start-1 row-start-1 outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-50 data-[state=open]:bg-accent",
            )}
          >
            {label && (
              <CellLabel active={active} className={onReset ? "max-w-full pe-5" : undefined}>
                {label}
              </CellLabel>
            )}
            <span
              className={cn(
                "flex min-w-0 items-center gap-1.5 text-sm font-medium whitespace-nowrap",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {loading ? <Spinner size="sm" /> : icon}
              <span className="truncate">{loading ? "Loading…" : (value ?? label)}</span>
              <ChevronDownIcon className="size-3.5 shrink-0 opacity-50" />
            </span>
            {inRoot && (
              <PopoverAnchor asChild>
                <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-0" />
              </PopoverAnchor>
            )}
          </button>
        </PopoverTrigger>
        {onReset && active && !disabled && !loading && (
          <span className="pointer-events-none col-start-1 row-start-1 self-start justify-self-end p-0.5">
            <CellReset label={label} active={active} onReset={onReset} className="pointer-events-auto" />
          </span>
        )}
      </div>
      <PopoverContent
        align={align}
        sideOffset={6}
        className={cn("p-2", inRoot && "min-w-(--radix-popover-trigger-width)", contentClassName)}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

interface FilterToggleCellProps<T extends string> extends Omit<React.ComponentProps<"div">, "defaultValue"> {
  label: string;
  value?: T;
  defaultValue?: T;
  onValueChange?: (value: T) => void;
  active?: boolean;
  onReset?: () => void;
  disabled?: boolean;
  /**
   * `wide` gives a long row of segments a whole line of a narrow bar. The default is `wide` from four segments up.
   */
  width?: "default" | "wide";
  /** `SegmentedItem`s. */
  children?: React.ReactNode;
}

/** A filter with two or three short options, switched in place without a popover. */
export function FilterToggleCell<T extends string>({
  label,
  value,
  defaultValue,
  onValueChange,
  active = false,
  onReset,
  disabled = false,
  width,
  className,
  children,
  ...props
}: FilterToggleCellProps<T>) {
  const inRoot = useContext(FilterRootContext);
  const isWide = width == null ? Children.count(children) > 3 : width === "wide";
  return (
    <div
      data-slot="filter-toggle-cell"
      data-active={active || undefined}
      data-disabled={disabled || undefined}
      className={cn(
        cellBase,
        "relative",
        inRoot ? cellInRoot : cellStandalone,
        // Long segment rows outgrow a half-width cell and a third-width cell.
        inRoot && isWide && "basis-full @md:basis-3/5",
        active && activeUnderline,
        className,
      )}
      {...props}
    >
      <span className={cn("flex", onReset && "pe-5")}>
        <CellLabel active={active}>{label}</CellLabel>
      </span>
      {onReset && active && !disabled && (
        <CellReset label={label} active={active} onReset={onReset} className="absolute end-0.5 top-0.5" />
      )}
      <Segmented
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        disabled={disabled}
        aria-label={label}
        width="hug"
        className="@md:flex-nowrap"
      >
        {children}
      </Segmented>
    </div>
  );
}
