import { ChevronDownIcon, type LucideIcon } from "lucide-react";

import { SkeletonRows } from "~/components/patterns/states/Skeletons";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { cn } from "~/lib/utils";

/**
 * A titled block of a dashboard: header strip, body, optional footer. The parts bring their own padding and
 * dividers, so a table or a chart can run edge to edge.
 */
export function Panel({ className, ...props }: React.ComponentProps<typeof Card>) {
  return <Card size="flush" className={className} {...props} />;
}

const panelHeaderSizes = {
  sm: "min-h-9 px-3 py-1.5",
  default: "min-h-12 px-4 py-2",
};

export function PanelHeader({
  title,
  description,
  icon: Icon,
  size = "default",
  as: Heading = "h3",
  accent,
  className,
  style,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  title: React.ReactNode;
  /** A quiet line under the title: what the panel counts, over which period. */
  description?: React.ReactNode;
  icon?: LucideIcon;
  size?: keyof typeof panelHeaderSizes;
  as?: "h2" | "h3" | "h4";
  /** A CSS color that identifies the panel's group: a stripe on the leading edge, and the icon takes it too. */
  accent?: string;
  /** Controls and meta, pushed to the trailing edge. */
  children?: React.ReactNode;
}) {
  return (
    // A minimum height, not a fixed one: a wrapped title would overflow and be cut by the card's own
    // `overflow-hidden`. `@container` lets controls inside decide what they have room for.
    <div
      data-slot="panel-header"
      style={accent ? { borderInlineStartColor: accent, ...style } : style}
      className={cn(
        "@container flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b",
        accent && "border-s-2",
        panelHeaderSizes[size],
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <Heading className={cn("flex min-w-0 items-center gap-2 font-semibold", size === "sm" ? "text-xs" : "text-sm")}>
          {Icon && (
            <Icon
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground"
              style={accent ? { color: accent } : undefined}
            />
          )}
          <span className="truncate">{title}</span>
        </Heading>
        {description && (
          <p
            data-slot="panel-header-description"
            className={cn("text-muted-foreground", size === "sm" ? "text-2xs" : "text-xs")}
          >
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

export function PanelBody({
  size = "default",
  className,
  ...props
}: React.ComponentProps<"div"> & { size?: "sm" | "default" }) {
  return (
    <div data-slot="panel-body" className={cn("min-w-0", size === "sm" ? "px-3 py-2" : "p-4", className)} {...props} />
  );
}

export function PanelFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-footer"
      className={cn("border-t px-3 py-2 text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

interface PanelViewToggleProps<T extends string> extends Omit<
  React.ComponentProps<"div">,
  "value" | "defaultValue" | "onChange" | "dir"
> {
  value?: T;
  defaultValue?: T;
  onValueChange?: (value: T) => void;
  /** `PanelViewOption`s. */
  children?: React.ReactNode;
}

/** Switches a panel between views of the same data: a list and a plot. It goes in the `PanelHeader`. */
export function PanelViewToggle<T extends string>({
  value,
  defaultValue,
  onValueChange,
  className,
  children,
  "aria-label": ariaLabel = "View",
  ...props
}: PanelViewToggleProps<T>) {
  const [current, setCurrent] = useControllableState<T | "">({
    value,
    defaultValue: defaultValue ?? "",
    onValueChange: onValueChange as ((next: T | "") => void) | undefined,
  });
  return (
    <ToggleGroup
      data-slot="panel-view-toggle"
      type="single"
      size="sm"
      aria-label={ariaLabel}
      value={current}
      onValueChange={(next) => next && setCurrent(next as T)}
      className={className}
      {...props}
    >
      {children}
    </ToggleGroup>
  );
}

/** One view of a `PanelViewToggle`: an icon, named by `label`. */
export function PanelViewOption({
  label,
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupItem> & { label: string }) {
  return (
    <ToggleGroupItem
      data-slot="panel-view-option"
      aria-label={label}
      title={label}
      className={cn("size-7 [&_svg]:size-3.5", className)}
      {...props}
    />
  );
}

interface PanelShowMoreProps extends Omit<React.ComponentProps<typeof Button>, "children"> {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** How many rows there are when everything is shown. */
  total: number;
}

/** The last row of a panel that shows the first few rows of a longer list. */
export function PanelShowMore({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  total,
  className,
  ...props
}: PanelShowMoreProps) {
  const [open, setOpen] = useControllableState({
    value: openProp,
    defaultValue: defaultOpen,
    onValueChange: onOpenChange,
  });
  return (
    <Button
      data-slot="panel-show-more"
      data-state={open ? "open" : "closed"}
      variant="row"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className={cn("justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-foreground", className)}
      {...props}
    >
      {open ? "Show fewer" : `Show all ${total}`}
      <ChevronDownIcon
        className={cn("size-3.5 transition-transform duration-fast ease-standard", open && "rotate-180")}
      />
    </Button>
  );
}

export function PanelMessage({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="panel-message"
      className={cn("px-4 py-6 text-center text-sm text-balance text-muted-foreground", className)}
      {...props}
    />
  );
}

export function PanelSkeleton({
  rows = 5,
  className,
  ...props
}: Omit<React.ComponentProps<typeof SkeletonRows>, "rows"> & { rows?: number }) {
  return <SkeletonRows data-slot="panel-skeleton" rows={rows} className={cn("p-4", className)} {...props} />;
}

/** A titled strip that divides the rows of a panel or list into groups: "Today", "Core items". */
export function PanelSection({
  title,
  as: Heading = "h4",
  tone,
  position = "static",
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  title: React.ReactNode;
  as?: "h3" | "h4" | "h5" | "div";
  /** `subtle` is the translucent strip; `opaque` is the panel's own surface. A sticky strip defaults to `opaque`. */
  tone?: "subtle" | "opaque";
  /** `sticky` keeps the strip at the top of the panel's scroll container while its rows scroll past. */
  position?: "static" | "sticky";
  /** Counts or controls on the trailing edge of the strip. */
  children?: React.ReactNode;
}) {
  const resolvedTone = tone ?? (position === "sticky" ? "opaque" : "subtle");
  return (
    <div
      data-slot="panel-section"
      data-tone={resolvedTone}
      data-position={position}
      className={cn(
        "flex min-w-0 items-center justify-between gap-2 border-b px-4 py-1.5 text-2xs text-muted-foreground",
        // A translucent strip lets the rows scroll through it, so a pinned one takes the panel's own surface.
        resolvedTone === "opaque" ? "bg-card" : "bg-subtle",
        position === "sticky" && "sticky top-0 z-10",
        className,
      )}
      {...props}
    >
      <Heading className="truncate font-semibold tracking-wider uppercase">{title}</Heading>
      {children}
    </div>
  );
}
