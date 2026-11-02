import { FunnelIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { cn } from "~/lib/utils";

interface ColumnFilterProps {
  /** The column it filters: names the button ("Filter Hero") and the popover. */
  label: string;
  /** The column's filter is set: the funnel turns solid and brand red, so it reads by shape as well as color. */
  active?: boolean;
  /** Clears every filter inside, from the foot of the popover. */
  onReset?: () => void;
  /** The editors: a search, a few toggles. */
  children: React.ReactNode;
  className?: string;
}

/**
 * A filter that narrows one column's rows, in that column's head: a funnel button beside the column name that opens
 * its editors in a popover. For filters of the shown rows only (a name search, slots, tiers); what changes the query
 * of the whole page stays in the page's FilterBar.
 */
export function ColumnFilter({ label, active = false, onReset, children, className }: ColumnFilterProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          data-slot="column-filter"
          data-active={active || undefined}
          variant="ghost"
          size="icon-xs"
          // The state is in the name too, not only in the funnel's fill.
          aria-label={active ? `Filter ${label}, set` : `Filter ${label}`}
          className={cn(
            "text-muted-foreground data-active:text-primary [&_svg]:size-3.5 data-active:[&_svg]:fill-current",
            className,
          )}
        >
          <FunnelIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={`Filter ${label}`}
        align="start"
        sideOffset={6}
        className="flex w-72 flex-col gap-3 p-3"
      >
        {children}
        {/* Always there, disabled while nothing is set: the first keystroke must not grow the popover. */}
        {onReset && (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            disabled={!active}
            onClick={() => {
              onReset();
              setOpen(false);
            }}
          >
            Clear filter
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
