import { Suspense, type ReactElement } from "react";

import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Tooltip, TooltipTarget } from "~/components/ui/tooltip";

interface StatTrendHoverCardProps extends Pick<React.ComponentProps<typeof Tooltip>, "side" | "align"> {
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
  children: React.ReactNode;
}

export function StatTrendHoverCard({
  trigger,
  triggerAs = "target",
  triggerDisplay,
  side = "bottom",
  align = "end",
  children,
  ...props
}: StatTrendHoverCardProps) {
  return (
    <Tooltip
      variant="preview"
      side={side}
      align={align}
      content={
        <Suspense fallback={<LoadingState label="trend" className="flex h-62.5 items-center justify-center" />}>
          {children}
        </Suspense>
      }
      {...props}
    >
      {triggerAs === "target" ? <TooltipTarget display={triggerDisplay}>{trigger}</TooltipTarget> : trigger}
    </Tooltip>
  );
}
