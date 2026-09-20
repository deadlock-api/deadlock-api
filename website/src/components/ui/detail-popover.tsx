import { type ComponentProps, type ReactNode, useState } from "react";

import { Button } from "~/components/ui/button";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { PanelTooltipContent } from "~/components/ui/panel-tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Tooltip, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

/** Hover previews stay quick; a click, tap or Enter pins the same information for closer inspection. */
export function DetailPopover({
  label,
  children,
  details,
  size = "icon-sm",
  underline = "none",
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, "children" | "size"> & {
  label: string;
  children: ReactNode;
  details: ReactNode;
  size?: ComponentProps<typeof Button>["size"];
  /** `dotted` marks a word or a number that hides details behind it, for a trigger that is text rather than an icon. */
  underline?: "none" | "dotted";
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useControllableState({
    value: openProp,
    defaultValue: defaultOpen,
    onValueChange: onOpenChange,
  });
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
              className={cn(underline === "dotted" && "underline decoration-dotted underline-offset-4", className)}
              type="button"
              aria-label={`${label} details`}
              {...props}
              onClick={(event) => {
                event.stopPropagation();
                props.onClick?.(event);
              }}
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
        className="flex max-h-[var(--radix-popover-content-available-height)] max-w-[var(--radix-popover-content-available-width)] flex-col gap-2 overflow-y-auto overscroll-contain"
        onClick={(event) => event.stopPropagation()}
      >
        {details}
      </PopoverContent>
    </Popover>
  );
}
