import { ChevronDownIcon, type LucideIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { Text } from "~/components/ui/text";
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
  accent,
  className,
  style,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  title: React.ReactNode;
  /** A quiet line beside the title: the date range, the sample size, the unit. */
  description?: React.ReactNode;
  icon?: LucideIcon;
  size?: keyof typeof panelHeaderSizes;
  /** A CSS color that identifies the panel's group: a stripe on the leading edge, and the icon takes it too. */
  accent?: string;
  /** Controls, pushed to the trailing edge. */
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
      <h3 className={cn("flex min-w-0 items-center gap-2 font-semibold", size === "sm" ? "text-xs" : "text-sm")}>
        {Icon && (
          <Icon
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground"
            style={accent ? { color: accent } : undefined}
          />
        )}
        <span className="truncate">{title}</span>
      </h3>
      {description && (
        <Text data-slot="panel-header-description" variant="meta" tone="muted" numeric="tabular">
          {description}
        </Text>
      )}
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

/** A titled strip that divides the rows of a panel or list into groups: "Today", "Core items". */
export function PanelSection({
  title,
  tone = "subtle",
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  title: React.ReactNode;
  /** `subtle` is the translucent strip; `opaque` is the panel's own surface, for a strip that rows scroll under. */
  tone?: "subtle" | "opaque";
  /** Counts or controls on the trailing edge of the strip. */
  children?: React.ReactNode;
}) {
  return (
    <div
      data-slot="panel-section"
      data-tone={tone}
      className={cn(
        "flex min-w-0 items-center justify-between gap-2 border-b px-4 py-1.5 text-2xs text-muted-foreground",
        tone === "opaque" ? "bg-card" : "bg-subtle",
        className,
      )}
      {...props}
    >
      <div className="truncate eyebrow text-2xs">{title}</div>
      {children}
    </div>
  );
}
