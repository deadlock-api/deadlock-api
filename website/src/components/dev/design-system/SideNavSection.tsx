import { ChevronRight } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { FOCUS_RING } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

interface SideNavSectionProps extends Omit<React.ComponentProps<typeof Collapsible>, "title"> {
  label: React.ReactNode;
  /** How many destinations are inside, shown while the section is closed or open. */
  count?: number;
  /** `1` is a top-level category; `2` is a group nested inside one. */
  level?: 1 | 2;
}

/**
 * A category of the showcase index that opens and closes. Sections nest: a level 1 section holds level 2 sections, which
 * hold SideNavItems. State is `open` / `defaultOpen` / `onOpenChange`.
 */
export function SideNavSection({ label, count, level = 1, className, children, ...props }: SideNavSectionProps) {
  return (
    <Collapsible
      data-slot="side-nav-section"
      data-level={level}
      className={cn("flex min-w-0 flex-col", className)}
      {...props}
    >
      <CollapsibleTrigger
        className={cn(
          FOCUS_RING,
          "group/section flex min-h-7 w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-start transition-colors duration-fast hover:bg-sidebar-accent/50",
          level === 1 ? "eyebrow text-sidebar-foreground" : "type-caption font-medium text-muted-foreground",
        )}
      >
        <ChevronRight
          aria-hidden="true"
          className="size-3 shrink-0 transition-transform duration-fast group-data-[state=open]/section:rotate-90 rtl:-scale-x-100"
        />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count !== undefined && <span className="shrink-0 type-meta text-muted-foreground tabular-nums">{count}</span>}
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn("flex min-w-0 flex-col gap-0.5 pt-0.5", level === 1 ? "ps-1" : "border-s border-hairline ps-2")}
      >
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
