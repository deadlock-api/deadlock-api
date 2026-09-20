import { Slot } from "radix-ui";

import { PADDING_X, type Space } from "~/components/ui/layout-props";
import { cn } from "~/lib/utils";

interface BoxProps extends React.ComponentProps<"div"> {
  paddingX?: Space;
  asChild?: boolean;
}

/** An element with inline padding from the spacing scale and nothing else. It never draws: a surface is a Card. */
export function Box({ paddingX, asChild = false, className, ...props }: BoxProps) {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp
      data-slot="box"
      className={cn("min-w-0", paddingX !== undefined && PADDING_X[paddingX], className)}
      {...props}
    />
  );
}
