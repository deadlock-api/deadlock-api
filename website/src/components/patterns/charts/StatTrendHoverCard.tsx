import { Suspense, type ReactElement } from "react";

import { LoadingState } from "~/components/patterns/states/LoadingState";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "~/components/ui/hover-card";
import { TooltipTarget } from "~/components/ui/panel-tooltip";
import { cn } from "~/lib/utils";

interface StatTrendHoverCardProps extends React.ComponentProps<typeof HoverCardContent> {
  /** The element the card hangs off. */
  trigger: ReactElement;
  /**
   * `target` wraps the trigger in a focusable span that carries the one focus treatment, so a plain value can open
   * the card from the keyboard; `child` makes the trigger itself the trigger, for an element that is already a
   * control and draws its own focus.
   */
  triggerAs?: "target" | "child";
  /** How the focusable target sits in its line. A trigger that must fill its column, such as a bar, takes `block`. */
  triggerDisplay?: React.ComponentProps<typeof TooltipTarget>["display"];
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function StatTrendHoverCard({
  trigger,
  triggerAs = "target",
  triggerDisplay,
  open,
  defaultOpen,
  onOpenChange,
  align = "end",
  collisionPadding = 16,
  className,
  children,
  ...props
}: StatTrendHoverCardProps) {
  return (
    <HoverCard openDelay={150} closeDelay={100} open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <HoverCardTrigger asChild>
        {triggerAs === "target" ? <TooltipTarget display={triggerDisplay}>{trigger}</TooltipTarget> : trigger}
      </HoverCardTrigger>
      <HoverCardContent
        align={align}
        collisionPadding={collisionPadding}
        className={cn("w-112 max-w-[var(--radix-hover-card-content-available-width)]", className)}
        {...props}
      >
        <Suspense fallback={<LoadingState label="trend" className="flex h-62.5 items-center justify-center" />}>
          {children}
        </Suspense>
      </HoverCardContent>
    </HoverCard>
  );
}
