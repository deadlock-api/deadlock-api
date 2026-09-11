import { ChevronDown, ChevronUp, type LucideIcon } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { cn } from "~/lib/utils";

import { DashboardPanel } from "./DashboardPanel";

/** A compact preview that opens its detailed statistics in the same place. */
export function ExpandableDashboardPanel({
  title,
  icon,
  meta,
  keepMetaOnExpand = false,
  children,
  details,
}: {
  title: string;
  icon: LucideIcon;
  meta?: ReactNode;
  keepMetaOnExpand?: boolean;
  children: ReactNode;
  details: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const Chevron = expanded ? ChevronUp : ChevronDown;

  return (
    <Collapsible
      ref={panelRef}
      open={expanded}
      onOpenChange={(open) => {
        setExpanded(open);
        // Keep the card reachable after collapsing a long table from its footer.
        if (!open && (panelRef.current?.getBoundingClientRect().top ?? 0) < 0) {
          requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: "start" }));
        }
      }}
      className={cn("min-w-0 scroll-mt-4", expanded && "@2xl/overview:col-span-2")}
    >
      <DashboardPanel title={title} icon={icon} meta={expanded && !keepMetaOnExpand ? "Detailed stats" : meta}>
        <div hidden={expanded}>{children}</div>
        <CollapsibleContent>{details}</CollapsibleContent>
        <div className="mt-1 flex justify-end">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`${expanded ? "Show less" : "Show more"} ${title.toLowerCase()}`}
            >
              {expanded ? "Show less" : "Show more"}
              <Chevron data-icon="inline-end" />
            </Button>
          </CollapsibleTrigger>
        </div>
      </DashboardPanel>
    </Collapsible>
  );
}
