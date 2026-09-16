import { type ComponentProps, type ReactNode, useState } from "react";

import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Tooltip, TooltipTrigger } from "~/components/ui/tooltip";

import { PanelTooltipContent } from "./PanelTooltipContent";

/** Hover previews stay quick; a click, tap or Enter pins the same information for closer inspection. */
export function TrackerDetailPopover({
  label,
  children,
  details,
  size = "icon-sm",
  className,
}: {
  label: string;
  children: ReactNode;
  details: ReactNode;
  size?: ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        setPreviewOpen(false);
      }}
    >
      <Tooltip open={!open && previewOpen} onOpenChange={setPreviewOpen}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size={size}
              className={className}
              type="button"
              aria-label={`${label} details`}
              onClick={(event) => event.stopPropagation()}
            >
              {children}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <PanelTooltipContent>{details}</PanelTooltipContent>
      </Tooltip>
      <PopoverContent
        aria-label={`${label} details`}
        collisionPadding={16}
        className="flex max-h-[var(--radix-popover-content-available-height)] max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-y-auto overscroll-contain"
        onClick={(event) => event.stopPropagation()}
      >
        {details}
      </PopoverContent>
    </Popover>
  );
}
