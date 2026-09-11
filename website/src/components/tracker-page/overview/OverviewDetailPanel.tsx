import { Maximize2, type LucideIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "~/components/ui/dialog";

import { DashboardPanel } from "./DashboardPanel";

/** Keep the overview compact while making the full statistics available in a dialog. */
export function OverviewDetailPanel({
  title,
  icon,
  meta,
  showMetaInDialog = false,
  children,
  details,
  footer,
}: {
  title: string;
  icon: LucideIcon;
  meta?: ReactNode;
  showMetaInDialog?: boolean;
  children: ReactNode;
  details: (close: () => void) => ReactNode;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DashboardPanel title={title} icon={icon} meta={meta}>
        {children}
        <div className="mt-1 flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {footer && <div className="min-w-0 flex-1 text-[10px] text-muted-foreground">{footer}</div>}
          <DialogTrigger asChild>
            <Button variant="ghost" size="xs" aria-label={`Show more ${title.toLowerCase()}`}>
              Show more
              <Maximize2 data-icon="inline-end" />
            </Button>
          </DialogTrigger>
        </div>
      </DashboardPanel>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-3 overflow-hidden p-4 sm:max-w-7xl"
      >
        <DialogHeader className="shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3 pr-8">
            <DialogTitle>{title}</DialogTitle>
            {showMetaInDialog && <div className="text-xs text-muted-foreground">{meta}</div>}
          </div>
        </DialogHeader>
        {/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- Keyboard users need to focus and scroll the dialog body, even when it contains only a table. */}
        <section
          tabIndex={0}
          aria-label={`${title} details`}
          className="@container/stats-dialog min-h-0 overflow-y-auto rounded-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          {details(() => setOpen(false))}
        </section>
        {/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */}
        <DialogFooter showCloseButton className="shrink-0" />
      </DialogContent>
    </Dialog>
  );
}
