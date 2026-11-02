import { ChevronDownIcon, RotateCcw } from "lucide-react";
import { Children, createContext, useContext } from "react";

import { Button } from "~/components/ui/button";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { FOCUS_RING } from "~/components/ui/recipes";
import { Segmented } from "~/components/ui/segmented";
import { cn } from "~/lib/utils";

/** True inside a `cells` FilterBar, where every filter is a one-line chip. */
export const FilterRootContext = createContext(false);

const cellBase = "flex min-w-0 flex-col justify-center gap-0.5 px-4 py-2 text-start transition-colors";
// In a page's bar every filter is a one-line chip as wide as its content: a quiet outline at its default, a raised
// fill with its reset once it differs (the reset, not only the fill, says it is set).
const chipInRoot = "shrink-0 rounded-md border border-border data-active:border-transparent data-active:bg-accent";
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
    // Wraps onto a second line like the value does: a half-width cell on a phone cut "Matches (range)" and
    // "Matches (total)" to the same "Matches (…".
    <span data-slot="filter-cell-label" className={cn("line-clamp-2 eyebrow", active && "text-primary", className)}>
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
  icon?: React.ReactNode;
  /** The editor, shown in the popover. */
  children: React.ReactNode;
  /** Sizes the popover: its width and padding. */
  contentClassName?: string;
  align?: "start" | "center";
  /**
   * `sm` is one line at the height of `Select size="sm"`, with the label beside the value: for a selector inside a
   * `FilterBar variant="toolbar"`. In a `cells` bar every cell is that one-line chip already.
   */
  size?: "default" | "sm";
  /** Whether the editor is showing; a single-choice selector closes it once a choice is made. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** What a selector built on `FilterCell` passes through to it: everything but the value wiring it supplies itself. */
export type FilterCellPassthroughProps = Omit<
  FilterCellProps,
  "label" | "value" | "defaultValue" | "active" | "onReset" | "children"
>;

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
  icon,
  children,
  contentClassName,
  className,
  align = "start",
  size = "default",
  open,
  defaultOpen = false,
  onOpenChange,
  ...props
}: FilterCellProps) {
  const inRoot = useContext(FilterRootContext);
  // A chip of a page's bar is one line, like the toolbar size.
  const compact = size === "sm" || inRoot;
  return (
    <Popover open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <div
        data-slot="filter-cell"
        data-active={active || undefined}
        data-size={compact ? "sm" : "default"}
        className={cn(
          "grid",
          inRoot ? cn(chipInRoot, "static @2xl:relative") : cn(cellStandalone, "relative min-w-0"),
          compact && "h-8 rounded-md",
          active && !inRoot && activeUnderline,
          className,
        )}
        {...props}
      >
        <PopoverTrigger asChild>
          {/* ds-allow raw-button: the cell itself is the trigger; its two-line label/value layout is not a Button */}
          <button
            type="button"
            className={cn(
              cellBase,
              FOCUS_RING,
              "col-start-1 row-start-1 hover:bg-accent focus-visible:bg-accent focus-visible:ring-inset data-[state=open]:bg-accent",
              compact && "flex-row items-center justify-start gap-2 rounded-md px-3 py-0",
              // The reset's room is kept while there is nothing to reset: setting the filter must not widen the
              // control and re-wrap the toolbar around it.
              compact && onReset && "pe-8",
            )}
          >
            {label && compact && (
              <span
                data-slot="filter-cell-label"
                className={cn("type-caption text-muted-foreground", active && !inRoot && "text-primary")}
              >
                {label}
              </span>
            )}
            {label && !compact && (
              <CellLabel active={active} className={onReset ? "max-w-full pe-5" : undefined}>
                {label}
              </CellLabel>
            )}
            <span
              className={cn(
                "flex min-w-0 items-center gap-1.5 text-sm font-medium",
                compact && "whitespace-nowrap",
                active || inRoot ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {icon}
              {/* A chip of the bar keeps its whole value (it wraps to another row instead); the toolbar size truncates. */}
              <span className={inRoot ? "" : compact ? "truncate" : "line-clamp-2 text-start"}>{value ?? label}</span>
              <ChevronDownIcon className="size-3.5 shrink-0 opacity-50" />
            </span>
            {inRoot && (
              <PopoverAnchor asChild>
                <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-0" />
              </PopoverAnchor>
            )}
          </button>
        </PopoverTrigger>
        {onReset && active && (
          <span
            className={cn(
              "pointer-events-none col-start-1 row-start-1 justify-self-end p-0.5",
              compact ? "self-center" : "self-start",
            )}
          >
            <CellReset label={label} active={active} onReset={onReset} className="pointer-events-auto" />
          </span>
        )}
      </div>
      <PopoverContent
        // The trigger reads "Rank Phantom 1+"; the editor is named by the filter alone.
        aria-label={label}
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
  /** The choice it starts on when uncontrolled, and the one the reset returns to. */
  defaultValue?: T;
  onValueChange?: (value: T) => void;
  disabled?: boolean;
  /**
   * `wide` gives a long row of segments a whole row of a narrow bar. The default is `wide` from four segments up.
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
  disabled = false,
  width,
  className,
  children,
  ...props
}: FilterToggleCellProps<T>) {
  const inRoot = useContext(FilterRootContext);
  const [current, setCurrent] = useControllableState<T | "">({
    value,
    defaultValue: defaultValue ?? "",
    onValueChange: onValueChange as ((next: T | "") => void) | undefined,
  });
  const active = defaultValue !== undefined && current !== defaultValue;
  const onReset = defaultValue !== undefined ? () => setCurrent(defaultValue) : undefined;
  const isWide = width == null ? Children.count(children) > 3 : width === "wide";
  if (inRoot) {
    return (
      <div
        data-slot="filter-toggle-cell"
        data-active={active || undefined}
        data-disabled={disabled || undefined}
        className={cn(
          chipInRoot,
          "flex min-h-8 items-center gap-2 ps-3 pe-0.5",
          // A long row of segments takes a row of its own on a narrow bar rather than wrapping its options.
          isWide && "max-@md:basis-full",
          className,
        )}
        {...props}
      >
        <span data-slot="filter-cell-label" className="type-caption text-muted-foreground">
          {label}
        </span>
        <Segmented
          value={current}
          onValueChange={setCurrent}
          disabled={disabled}
          aria-label={label}
          size="sm"
          width="hug"
          className="min-h-0 border-0 p-0"
        >
          {children}
        </Segmented>
        {/* The reset's room is kept while there is nothing to reset, so changing the choice never widens the chip. */}
        {onReset && (
          <span className="flex size-6 shrink-0 items-center justify-center">
            {active && !disabled && <CellReset label={label} active={active} onReset={onReset} />}
          </span>
        )}
      </div>
    );
  }
  return (
    <div
      data-slot="filter-toggle-cell"
      data-active={active || undefined}
      data-disabled={disabled || undefined}
      className={cn(cellBase, "relative", cellStandalone, active && activeUnderline, className)}
      {...props}
    >
      <span className={cn("flex", onReset && "pe-5")}>
        <CellLabel active={active}>{label}</CellLabel>
      </span>
      {onReset && active && !disabled && (
        <CellReset label={label} active={active} onReset={onReset} className="absolute inset-e-0.5 top-0.5" />
      )}
      <Segmented
        value={current}
        onValueChange={setCurrent}
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

interface FilterAdvancedProps extends FilterCellPassthroughProps {
  /** Names the cell and its popover. */
  label?: string;
  /** How many of the filters inside differ from their defaults: the cell says so and is underlined like a changed one. */
  activeCount?: number;
  /** Puts every filter inside back to its default; the reset shows while one differs. */
  onReset?: () => void;
  /** The filters, each a `FilterCell` or a selector built on one. */
  children?: React.ReactNode;
}

/**
 * The rarely used filters of a bar, in the popover of one cell. A filter inside still applies while the popover is
 * closed: the cell counts the ones that are set.
 */
export function FilterAdvanced({
  label = "Advanced",
  activeCount = 0,
  onReset,
  contentClassName,
  children,
  ...props
}: FilterAdvancedProps) {
  return (
    <FilterCell
      label={label}
      value={activeCount > 0 ? `${activeCount} set` : "None"}
      active={activeCount > 0}
      onReset={onReset}
      contentClassName={cn("flex w-64 flex-col gap-2", contentClassName)}
      {...props}
    >
      {/* Its filters stand alone in the popover, each a bordered cell of its own, not a share of the bar's row. */}
      <FilterRootContext.Provider value={false}>{children}</FilterRootContext.Provider>
    </FilterCell>
  );
}
