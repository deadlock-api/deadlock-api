import type { ComponentProps } from "react";

import { TooltipContent } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

/** The popover-styled hover card the other pages' tables use, in place of the primitive's inverted default. */
export function PanelTooltipContent({ className, ...props }: ComponentProps<typeof TooltipContent>) {
  return (
    <TooltipContent
      className={cn("border border-border bg-popover px-3 py-2 text-popover-foreground shadow-md", className)}
      {...props}
    />
  );
}
