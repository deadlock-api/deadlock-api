import { cva, type VariantProps } from "class-variance-authority";
import { Tabs as TabsPrimitive } from "radix-ui";
import * as React from "react";

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
const tabsListVariants = cva("inline-flex w-fit items-center justify-center text-muted-foreground", {
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
    { orientation: "horizontal", variant: ["default", "line"], class: "h-9" },
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
    "relative inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground transition-all outline-none hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
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
      className={cn("flex-1 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
