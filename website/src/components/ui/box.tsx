import { Slot } from "radix-ui";

import { PADDING, PADDING_X, PADDING_Y, type Space } from "~/components/ui/layout-props";
import { cn } from "~/lib/utils";

interface BoxProps extends React.ComponentProps<"div"> {
  padding?: Space;
  paddingX?: Space;
  paddingY?: Space;
  asChild?: boolean;
}

/** An element with padding from the spacing scale and nothing else. It never draws: a surface is a Card. */
export function Box({ padding, paddingX, paddingY, asChild = false, className, ...props }: BoxProps) {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp
      data-slot="box"
      className={cn(
        "min-w-0",
        padding !== undefined && PADDING[padding],
        paddingX !== undefined && PADDING_X[paddingX],
        paddingY !== undefined && PADDING_Y[paddingY],
        className,
      )}
      {...props}
    />
  );
}
