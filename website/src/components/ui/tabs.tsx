import { cva, type VariantProps } from "class-variance-authority";
import { Tabs as TabsPrimitive } from "radix-ui";
import * as React from "react";

import { DISABLED_STATE, FOCUS_RING, FOCUS_RING_BORDER, SVG_SLOT } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

type TabsOrientation = NonNullable<React.ComponentProps<typeof TabsPrimitive.Root>["orientation"]>;
type TabsVariant = NonNullable<VariantProps<typeof tabsListVariants>["variant"]>;

// Each part resolves its orientation and variant from these contexts into plain classes. An ancestor selector
// (`group-data-[orientation=…]/tabs`) would also match the outer Tabs when one Tabs is nested in another.
const TabsOrientationContext = React.createContext<TabsOrientation>("horizontal");
const TabsVariantContext = React.createContext<TabsVariant>("default");

function Tabs({ className, orientation = "horizontal", ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsOrientationContext value={orientation}>
      <TabsPrimitive.Root
        data-slot="tabs"
        data-orientation={orientation}
        orientation={orientation}
        className={cn("flex gap-2", orientation === "horizontal" && "flex-col", className)}
        {...props}
      />
    </TabsOrientationContext>
  );
}

/**
 * - `default`: a filled track, for switching views inside a panel or dialog.
 * - `line`: an underline, for sections of one piece of content.
 * - `nav`: a full-width underline with a bottom rule, for the top-level sections of a page.
 */
// `justify-center-safe`: a list wider than its container scrolls from its first tab instead of cutting it off.
const tabsListVariants = cva("inline-flex w-fit max-w-full items-center justify-center-safe text-muted-foreground", {
  variants: {
    variant: {
      default: "rounded-lg bg-muted p-1",
      line: "gap-1 rounded-none bg-transparent p-1",
      nav: "w-full gap-0 rounded-none border-b border-hairline bg-transparent p-0",
    },
    orientation: {
      horizontal: "",
      vertical: "h-fit flex-col",
    },
  },
  compoundVariants: [
    // Tabs that do not fit scroll inside the list (the padding keeps focus rings and the underline inside it) rather
    // than running out of their card, where a parent's clipping made the last ones unreachable.
    { orientation: "horizontal", variant: ["default", "line"], class: "h-9 scrollbar-thin overflow-x-auto" },
    { orientation: "horizontal", variant: "nav", class: "h-11" },
  ],
  defaultVariants: {
    variant: "default",
    orientation: "horizontal",
  },
});

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & Pick<VariantProps<typeof tabsListVariants>, "variant">) {
  const resolvedVariant = variant ?? "default";
  const orientation = React.use(TabsOrientationContext);
  return (
    <TabsVariantContext value={resolvedVariant}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={resolvedVariant}
        className={cn(tabsListVariants({ variant: resolvedVariant, orientation }), className)}
        {...props}
      />
    </TabsVariantContext>
  );
}

const tabsTriggerVariants = cva(
  [
    FOCUS_RING_BORDER,
    DISABLED_STATE,
    SVG_SLOT,
    "relative inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground transition-all hover:text-foreground data-[state=active]:text-foreground",
    "after:absolute after:rounded-full after:bg-primary after:opacity-0 after:transition-opacity",
  ],
  {
    variants: {
      variant: {
        default: "data-[state=active]:border-input data-[state=active]:bg-input/30 data-[state=active]:shadow-sm",
        line: "data-[state=active]:after:opacity-100",
        nav: "rounded-none px-4 hover:bg-subtle-hover data-[state=active]:after:opacity-100 data-[state=active]:after:shadow-glow-primary",
      },
      orientation: {
        horizontal: "after:inset-x-0 after:h-0.5",
        vertical: "w-full justify-start after:inset-y-0 after:-end-1 after:w-0.5",
      },
    },
    compoundVariants: [
      { orientation: "horizontal", variant: "line", class: "after:-bottom-1" },
      { orientation: "horizontal", variant: "nav", class: "after:-bottom-px" },
    ],
  },
);

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = React.use(TabsVariantContext);
  const orientation = React.use(TabsOrientationContext);
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      data-variant={variant}
      className={cn(tabsTriggerVariants({ variant, orientation }), className)}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(FOCUS_RING, "flex-1 rounded-sm", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
