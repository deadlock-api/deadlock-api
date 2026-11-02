import { cva, type VariantProps } from "class-variance-authority";
import { Tabs as TabsPrimitive } from "radix-ui";
import * as React from "react";

import { DISABLED_STATE, FOCUS_RING, FOCUS_RING_BORDER, SCROLLBAR_THIN, SVG_SLOT } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

type TabsOrientation = NonNullable<React.ComponentProps<typeof TabsPrimitive.Root>["orientation"]>;
type TabsVariant = NonNullable<VariantProps<typeof tabsListVariants>["variant"]>;

// Each part resolves its orientation and variant from these contexts into plain classes. An ancestor selector
// (`group-data-[orientation=…]/tabs`) would also match the outer Tabs when one Tabs is nested in another.
const TabsOrientationContext = React.createContext<TabsOrientation>("horizontal");
const TabsVariantContext = React.createContext<TabsVariant>("default");
// True while the arrow keys have moved through the list: the selected tab follows focus and its own mark shows where
// focus is, so it drops the focus ring. Focus arriving with Tab (the mark does not change) still shows the ring.
const TabsArrowedContext = React.createContext(false);

const ARROW_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

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
 * - `line`: an underline, for sections of one piece of content. Its tabs are as wide as their labels, from the start.
 * - `nav`: the sibling pages of a section under the page title: labels from the start edge over a rule, the current
 *   one underlined in the brand red.
 */
// `justify-center-safe`: a list wider than its container scrolls from its first tab instead of cutting it off.
const tabsListVariants = cva("inline-flex w-fit max-w-full items-center justify-center-safe text-muted-foreground", {
  variants: {
    variant: {
      default: "rounded-lg bg-muted p-1",
      // Content-sized tabs from the start edge: stretched tabs of mixed lengths read as unevenly spaced.
      line: "justify-start gap-1 rounded-none bg-transparent p-1",
      nav: "w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0",
    },
    orientation: {
      horizontal: "",
      vertical: "h-fit flex-col",
    },
  },
  compoundVariants: [
    // Tabs that do not fit scroll inside the list (the padding keeps focus rings and the underline inside it) rather
    // than running out of their card, where a parent's clipping made the last ones unreachable.
    { orientation: "horizontal", variant: ["default", "line"], class: `h-9 ${SCROLLBAR_THIN} overflow-x-auto` },
    { orientation: "horizontal", variant: "nav", class: "h-10" },
    // Content-sized line tabs side by side keep a clear gap between labels.
    { orientation: "horizontal", variant: "line", class: "gap-4" },
  ],
  defaultVariants: {
    variant: "default",
    orientation: "horizontal",
  },
});

function TabsList({
  className,
  variant = "default",
  onKeyDown,
  onBlur,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & Pick<VariantProps<typeof tabsListVariants>, "variant">) {
  const resolvedVariant = variant ?? "default";
  const orientation = React.use(TabsOrientationContext);
  const [arrowed, setArrowed] = React.useState(false);
  return (
    <TabsVariantContext value={resolvedVariant}>
      <TabsArrowedContext value={arrowed}>
        <TabsPrimitive.List
          data-slot="tabs-list"
          data-variant={resolvedVariant}
          className={cn(tabsListVariants({ variant: resolvedVariant, orientation }), className)}
          onKeyDown={(event) => {
            onKeyDown?.(event);
            if (ARROW_KEYS.has(event.key)) setArrowed(true);
          }}
          onBlur={(event) => {
            onBlur?.(event);
            if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) {
              setArrowed(false);
            }
          }}
          {...props}
        />
      </TabsArrowedContext>
    </TabsVariantContext>
  );
}

const tabsTriggerVariants = cva(
  [
    DISABLED_STATE,
    SVG_SLOT,
    "relative inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground transition-all hover:text-foreground data-[state=active]:text-foreground",
    "after:absolute after:rounded-full after:bg-primary after:opacity-0 after:transition-opacity",
  ],
  {
    variants: {
      variant: {
        default: "data-[state=active]:border-input data-[state=active]:bg-input/30 data-[state=active]:shadow-sm",
        line: "flex-none data-[state=active]:after:opacity-100",
        nav: "flex-none rounded-none px-0 data-[state=active]:after:rounded-none data-[state=active]:after:opacity-100",
      },
      orientation: {
        horizontal: "after:inset-x-0 after:h-0.5",
        vertical: "w-full justify-start after:inset-y-0 after:-inset-e-1 after:w-0.5",
      },
      // `inactive`: only a focused tab that is not the selected one is ringed (see TabsArrowedContext).
      focusRing: {
        always: FOCUS_RING_BORDER,
        inactive:
          "outline-none not-data-[state=active]:focus-visible:border-ring not-data-[state=active]:focus-visible:ring-2 not-data-[state=active]:focus-visible:ring-ring",
      },
    },
    compoundVariants: [
      { orientation: "horizontal", variant: "line", class: "after:-bottom-1" },
      { orientation: "horizontal", variant: "nav", class: "after:-bottom-px" },
    ],
  },
);

function TabsTrigger({ className, onMouseDown, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = React.use(TabsVariantContext);
  const orientation = React.use(TabsOrientationContext);
  const arrowed = React.use(TabsArrowedContext);
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      data-variant={variant}
      className={cn(
        tabsTriggerVariants({ variant, orientation, focusRing: arrowed ? "inactive" : "always" }),
        className,
      )}
      onMouseDown={(event) => {
        onMouseDown?.(event);
        // Radix selects on mouse down and focuses the tab from script, which Chrome counts as `:focus-visible` and
        // rings a clicked tab. Focusing it first without the ring makes Radix's focus a no-op; keys still ring it.
        if (!event.defaultPrevented && event.button === 0 && !event.ctrlKey && !props.disabled) {
          event.currentTarget.focus({ focusVisible: false });
        }
      }}
      {...props}
    />
  );
}

// Set by TabsPanels: its TabsContents share one grid cell.
const TabsPanelsContext = React.createContext(false);

/**
 * Lays its `TabsContent`s in one grid cell, every one of them mounted, so the tab area is as tall as its tallest panel
 * and switching tabs (or a default tab picked after hydration) never moves what is below. Inactive panels are
 * `invisible`, which also takes them out of the tab order and the accessibility tree.
 */
function TabsPanels({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <TabsPanelsContext value={true}>
      <div data-slot="tabs-panels" className={cn("grid min-w-0 grid-cols-1", className)} {...props} />
    </TabsPanelsContext>
  );
}

function TabsContent({ className, forceMount, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  const stacked = React.use(TabsPanelsContext);
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      forceMount={stacked ? true : forceMount}
      className={cn(
        FOCUS_RING,
        "flex-1 rounded-sm",
        stacked && "col-start-1 row-start-1 min-w-0 data-[state=inactive]:invisible",
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, TabsPanels, tabsListVariants };
