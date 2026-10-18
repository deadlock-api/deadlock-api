import { Info } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { FOCUS_RING } from "~/components/ui/recipes";
import { Tooltip } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

/**
 * An info mark beside a label that opens what the label's owner wrote about it (a build author's note on a category,
 * a column's meaning). A toggletip: hover and focus open it, a click or tap toggles it, Escape closes it. The glyph is
 * 16px so it sits in a line of text; its hit area reaches 24px around it (WCAG 2.5.8). Give the parent a gap of at
 * least 4px so the hit area does not reach into a neighbouring control.
 */
function InfoTip({
  label,
  content,
  side,
  align,
  className,
  ...props
}: Omit<ComponentProps<"button">, "content" | "children" | "aria-label"> &
  Pick<ComponentProps<typeof Tooltip>, "side" | "align"> & {
    /** The accessible name: "About Laning". */
    label: string;
    content: ReactNode;
  }) {
  return (
    <Tooltip trigger="toggle" content={content} side={side} align={align}>
      <button
        type="button"
        data-slot="info-tip"
        aria-label={label}
        className={cn(
          FOCUS_RING,
          "relative inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors after:absolute after:-inset-1 hover:text-foreground aria-expanded:text-foreground",
          className,
        )}
        {...props}
      >
        <Info aria-hidden="true" className="size-3.5" />
      </button>
    </Tooltip>
  );
}

export { InfoTip };
