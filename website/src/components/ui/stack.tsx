import { Slot } from "radix-ui";

import { ALIGN, GAP, JUSTIFY, type Space } from "~/components/ui/layout-props";
import { cn } from "~/lib/utils";

interface StackProps extends React.ComponentProps<"div"> {
  gap?: Space;
  align?: keyof typeof ALIGN;
  justify?: keyof typeof JUSTIFY;
  asChild?: boolean;
}

/** Children in a column, spaced by the parent. The children set no margins of their own. */
export function Stack({
  gap = 3,
  align = "stretch",
  justify = "start",
  asChild = false,
  className,
  ...props
}: StackProps) {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp
      data-slot="stack"
      className={cn("flex min-w-0 flex-col", GAP[gap], ALIGN[align], JUSTIFY[justify], className)}
      {...props}
    />
  );
}

interface InlineProps extends StackProps {
  /** `wrap` lets a row of controls fold onto more lines on a narrow container; `nowrap` keeps one line. */
  wrap?: "wrap" | "nowrap";
}

/** Children in a row, spaced by the parent. */
export function Inline({
  gap = 2,
  align = "center",
  justify = "start",
  wrap = "wrap",
  asChild = false,
  className,
  ...props
}: InlineProps) {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp
      data-slot="inline"
      className={cn(
        "flex min-w-0",
        wrap === "wrap" ? "flex-wrap" : "flex-nowrap",
        GAP[gap],
        ALIGN[align],
        JUSTIFY[justify],
        className,
      )}
      {...props}
    />
  );
}
