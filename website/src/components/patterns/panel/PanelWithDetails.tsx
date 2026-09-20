import { type LucideIcon, Maximize2Icon } from "lucide-react";
import type { ReactNode } from "react";

import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "~/components/ui/dialog";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { FOCUS_RING } from "~/components/ui/recipes";
import { Text } from "~/components/ui/text";
import { cn } from "~/lib/utils";

// ds-allow law19-viewport-breakpoint: a dialog is sized against the viewport, and only `sm:` overrides ui/dialog's own
const dialogWidths = { default: "sm:max-w-2xl", full: "sm:max-w-7xl" };

interface PanelWithDetailsProps extends Omit<React.ComponentProps<typeof Panel>, "title"> {
  /** Also names the dialog and the "Show more" button, so it must be a string. */
  title: string;
  icon?: LucideIcon;
  /** A quiet line beside the title, in the panel and in the dialog: the sample size, the date range. */
  description?: ReactNode;
  /** Controls on the trailing edge of the header, in the panel and in the dialog. */
  actions?: ReactNode;
  /** @deprecated Text is `description`, controls are `actions`. */
  meta?: ReactNode;
  /** A footnote beside the "Show more" button. */
  footer?: ReactNode;
  /**
   * The dialog's body, mounted only while it is open, inside a container named `stats-dialog`
   * (`@sm/stats-dialog:`). A row in it that navigates away wraps its link in `DialogClose asChild`.
   */
  details: ReactNode;
  dialogSize?: keyof typeof dialogWidths;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * A compact panel that shows the top of its data, with "Show more" opening everything in a dialog. The dashboard
 * stays scannable and the full table is one click away. Children are the compact view.
 */
export function PanelWithDetails({
  title,
  icon,
  description,
  actions,
  meta,
  footer,
  details,
  dialogSize = "full",
  open: openProp,
  onOpenChange,
  children,
  ...props
}: PanelWithDetailsProps) {
  const [open, setOpen] = useControllableState({
    value: openProp,
    defaultValue: false,
    onValueChange: onOpenChange,
  });

  const controls = actions ?? meta;
  const trailing = controls && <div className="ms-auto flex flex-wrap items-center gap-2">{controls}</div>;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Panel {...props}>
        <PanelHeader title={title} description={description} icon={icon} size="sm">
          {trailing}
        </PanelHeader>
        <PanelBody size="sm" className="flex flex-col gap-1">
          {children}
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
            {footer && <div className="min-w-0 flex-1 text-3xs text-muted-foreground">{footer}</div>}
            <DialogTrigger asChild>
              <Button variant="ghost" size="xs" aria-label={`Show more ${title.toLowerCase()}`}>
                Show more
                <Maximize2Icon data-icon="inline-end" />
              </Button>
            </DialogTrigger>
          </div>
        </PanelBody>
      </Panel>
      <DialogContent
        aria-describedby={undefined}
        // ds-allow law1-arbitrary-value: the viewport minus the dialog's gutter; the scale has no step for it
        className={cn("flex max-h-[calc(100dvh-2rem)] flex-col gap-3 overflow-hidden p-4", dialogWidths[dialogSize])}
      >
        <DialogHeader className="shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3 pe-8">
            <DialogTitle>{title}</DialogTitle>
            {description && (
              <Text variant="meta" tone="muted" numeric="tabular">
                {description}
              </Text>
            )}
            {trailing}
          </div>
        </DialogHeader>
        {/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- Keyboard users need to focus and scroll the dialog body, even when it contains only a table. */}
        <section
          tabIndex={0}
          aria-label={`${title} details`}
          className={cn(
            FOCUS_RING,
            "@container/stats-dialog min-h-0 overflow-y-auto rounded-sm focus-visible:ring-inset",
          )}
        >
          {details}
        </section>
        {/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */}
        <DialogFooter showCloseButton className="shrink-0" />
      </DialogContent>
    </Dialog>
  );
}
