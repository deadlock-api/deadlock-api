import type { ComponentProps, ReactNode } from "react";

import { TooltipContent } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

/** The popover-styled hover card the other pages' tables use, in place of the primitive's inverted default. */
export function PanelTooltipContent({ className, ...props }: ComponentProps<typeof TooltipContent>) {
  return (
    <TooltipContent
      className={cn(
        "max-w-72 space-y-2 border border-border bg-popover px-3 py-2.5 text-left text-popover-foreground shadow-md",
        className,
      )}
      {...props}
    />
  );
}

/** What the hover card is about: a name, an optional supporting line, and an optional leading image or icon. */
export function TooltipHeader({ lead, title, subtitle }: { lead?: ReactNode; title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {lead}
      <div className="min-w-0 leading-tight">
        <div className="text-sm font-semibold">{title}</div>
        {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      </div>
    </div>
  );
}

/** Label and value pairs under a header, the values sharing one right-aligned column so the numbers line up. */
export function TooltipStats({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1 border-t border-border pt-2 text-xs">
      {children}
    </div>
  );
}

export function TooltipStat({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right font-medium tabular-nums", className)}>{value}</span>
    </>
  );
}
