import { Separator as SeparatorPrimitive } from "radix-ui";

import { cn } from "~/lib/utils";

const LINE =
  "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px";

/**
 * A rule between groups that share one surface. With `children` it is a labelled rule ("or" between two ways to do the
 * same thing): the label sits in the middle in muted body type, the line runs out to both ends. Horizontal, it fills
 * the row; vertical, it stretches to its parent's height.
 */
function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  children,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  if (children == null) {
    return (
      <SeparatorPrimitive.Root
        data-slot="separator"
        decorative={decorative}
        orientation={orientation}
        className={cn(LINE, className)}
        {...props}
      />
    );
  }
  const line = (
    <SeparatorPrimitive.Root
      decorative
      orientation={orientation}
      className={cn(LINE, "flex-1", orientation === "vertical" ? "min-h-4" : "min-w-4")}
    />
  );
  return (
    <div
      data-slot="separator"
      data-orientation={orientation}
      className={cn(
        "flex items-center gap-2 type-body text-muted-foreground",
        orientation === "vertical" ? "flex-col self-stretch" : "w-full",
        className,
      )}
      {...props}
    >
      {line}
      <span data-slot="separator-label">{children}</span>
      {line}
    </div>
  );
}

export { Separator };
